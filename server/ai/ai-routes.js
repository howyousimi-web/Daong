const express = require('express');

const { buildSystemPrompt, buildTaskMessages, sanitizeContext } = require('./ai-context');
const { buildLiveContext } = require('./ai-data');
const { optionalAuth } = require('../auth');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const UPSTREAM_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 25000;

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 10;
const MAX_REPLY_TOKENS = 500;

/* =========================================================
   MODEL CALL
   One place, one timeout, one error shape. Nothing from the
   provider's error body is ever forwarded to the browser.
   ========================================================= */
async function callModel({ system, messages, maxTokens }) {
  if (!API_KEY) return { ok: false, status: 503, code: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(maxTokens) || 400, MAX_REPLY_TOKENS),
        system,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[daong-ai] upstream %s: %s', res.status, detail.slice(0, 400));
      if (res.status === 429) return { ok: false, status: 429, code: 'rate_limited' };
      if (res.status === 401 || res.status === 403) return { ok: false, status: 503, code: 'not_configured' };
      return { ok: false, status: 502, code: 'upstream_error' };
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) return { ok: false, status: 502, code: 'empty_response' };
    return { ok: true, text };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.error('[daong-ai] upstream timed out after %dms', UPSTREAM_TIMEOUT_MS);
      return { ok: false, status: 504, code: 'timeout' };
    }
    console.error('[daong-ai] upstream call failed:', err && err.message);
    return { ok: false, status: 502, code: 'upstream_error' };
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   INPUT VALIDATION
   ========================================================= */
function normaliseHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE_CHARS) }));
}

// The Messages API requires the turn list to start with a user message
// and to alternate roles. A trimmed window can violate both.
function repairTurns(history, message) {
  const turns = normaliseHistory(history).filter(Boolean);
  const cleaned = [];

  for (const turn of turns) {
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous.role === turn.role) {
      cleaned[cleaned.length - 1] = turn;
    } else {
      cleaned.push(turn);
    }
  }

  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].role === 'user') cleaned.pop();

  return [...cleaned, { role: 'user', content: message }];
}

// The browser tells us which donation is on screen; we look the record
// up ourselves rather than trusting what it says about it.
function donationIdFromContext(context) {
  const onScreen = context && context.donationOnScreen;
  if (onScreen && typeof onScreen.id === 'string') return onScreen.id;
  return null;
}

/* =========================================================
   ROUTER
   ========================================================= */
function createAiRouter(store) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    if (!API_KEY) return res.status(503).json({ ok: false, error: 'not_configured' });
    return res.json({ ok: true, model: MODEL });
  });

  router.post('/chat', optionalAuth, async (req, res) => {
    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) return res.status(400).json({ error: 'empty_message' });
    if (message.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: 'message_too_long' });

    const safeContext = sanitizeContext(body.context || {});
    const isAdmin = !!(req.user && req.user.role === 'admin');
    const pageKey = safeContext.page && safeContext.page.key;

    // Live figures come from the database, not from the browser.
    let liveData = null;
    try {
      liveData = buildLiveContext(store, {
        pageKey,
        donationId: donationIdFromContext(body.context),
        isAdmin,
      });
    } catch (err) {
      console.error('[daong-ai] live context failed:', err.message);
    }

    const result = await callModel({
      system: buildSystemPrompt(safeContext, liveData),
      messages: repairTurns(normaliseHistory(body.history), message),
      maxTokens: MAX_REPLY_TOKENS,
    });

    if (!result.ok) return res.status(result.status).json({ error: result.code });
    return res.json({ reply: result.text });
  });

  router.post('/complete', optionalAuth, async (req, res) => {
    const body = req.body || {};
    const task = typeof body.task === 'string' ? body.task : '';
    const donationId = typeof body.donationId === 'string' ? body.donationId : '';

    if (!donationId) return res.status(400).json({ error: 'donation_id_required' });

    const record = store.findDonation(donationId);
    if (!record) return res.status(404).json({ error: 'not_found' });

    // Flag explanations are a coordinator tool and expose review detail,
    // so they need a coordinator token. Journey summaries are for the
    // public Track page and stay open.
    if (task === 'explain-flag' && !(req.user && req.user.role === 'admin')) {
      return res.status(403).json({ error: 'admin_only' });
    }

    // Unknown task names are rejected outright: the browser picks from a
    // fixed menu of prompts, it never supplies one.
    const built = buildTaskMessages(task, record);
    if (!built) return res.status(400).json({ error: 'unknown_task' });

    const result = await callModel({
      system: built.system,
      messages: built.messages,
      maxTokens: built.maxTokens,
    });

    if (!result.ok) return res.status(result.status).json({ error: result.code });
    return res.json({ text: result.text });
  });

  return router;
}

module.exports = { createAiRouter, MODEL, isConfigured: () => !!API_KEY };
