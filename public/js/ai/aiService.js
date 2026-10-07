/**
 * js/ai/aiService.js
 * -----------------------------------------------------------------
 * DAONG AI ASSISTANT — TRANSPORT LAYER
 *
 * The only file in the AI feature that performs a network request.
 * It mirrors the contract js/apiService.js already uses for the rest
 * of the site (one request() helper, a normalised result object, no
 * exceptions thrown at callers) so this feels like the same codebase
 * rather than a bolted-on widget.
 *
 * NO API KEY EVER LIVES HERE. This file only knows the URL of your own
 * backend. The Anthropic key stays in the server's environment — see
 * server/server.js and server/.env.example.
 *
 * Result shape (never throws):
 *   { ok: true,  reply: '…' }
 *   { ok: false, code: 'TIMEOUT' | 'NETWORK' | … }
 *
 * Configuration — define this BEFORE the script tag if you need to
 * point at a different host (e.g. a separate API domain in production):
 *   <script>window.DAONG_AI_CONFIG = { baseUrl: 'https://api.daong.org.ph/api/v1' };</script>
 *
 * Exposes: window.daongAiService
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  const DEFAULTS = {
    // Same-origin by default: the site is served by (or proxied to) the
    // Node backend in /server. Change to an absolute URL if the API
    // lives elsewhere — remember to add that origin to CORS_ORIGINS.
    baseUrl: '/api/v1',
    chatPath: '/ai/chat',
    completePath: '/ai/complete',
    healthPath: '/ai/health',
    timeoutMs: 30000,
    maxMessageChars: 2000,
  };

  const config = Object.assign({}, DEFAULTS, window.DAONG_AI_CONFIG || {});

  /* =========================================================
     ERROR CODES
     Callers map these to friendly copy (see aiAssistant.js).
     Raw statuses, stack traces and response bodies are logged to
     the console for developers but never surfaced to visitors.
     ========================================================= */
  const CODES = {
    EMPTY: 'EMPTY_MESSAGE',
    TOO_LONG: 'MESSAGE_TOO_LONG',
    TIMEOUT: 'TIMEOUT',
    NETWORK: 'NETWORK',
    UNAVAILABLE: 'BACKEND_UNAVAILABLE',
    RATE_LIMITED: 'RATE_LIMITED',
    SERVER: 'SERVER_ERROR',
    INVALID: 'INVALID_RESPONSE',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
  };

  function fail(code, detail) {
    if (detail) console.warn('[daongAiService]', code, detail);
    return { ok: false, code };
  }

  /**
   * Single fetch() choke point. Adds a timeout, converts every failure
   * mode into one of CODES, and guarantees a JSON object back.
   */
  async function post(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    const headers = { 'Content-Type': 'application/json' };
    // The coordinator-only tasks (and role-aware chat grounding) need
    // the same session token the rest of the site uses. Read through
    // apiService so there is one token store, not two.
    try {
      const token = window.apiService && window.apiService.TokenStore.get();
      if (token) headers.Authorization = 'Bearer ' + token;
    } catch (err) {
      /* not signed in — the public routes still work */
    }

    let res;
    try {
      res = await fetch(config.baseUrl + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') return fail(CODES.TIMEOUT);
      return fail(CODES.NETWORK, err && err.message);
    }
    clearTimeout(timer);

    if (res.status === 403) return fail(CODES.FORBIDDEN, 'HTTP 403');
    if (res.status === 404) return fail(CODES.NOT_FOUND, 'HTTP 404');
    if (res.status === 501 || res.status === 502 || res.status === 503 || res.status === 504) {
      return fail(CODES.UNAVAILABLE, 'HTTP ' + res.status);
    }
    if (res.status === 429) return fail(CODES.RATE_LIMITED);
    if (!res.ok) return fail(CODES.SERVER, 'HTTP ' + res.status);

    let data;
    try {
      data = await res.json();
    } catch (err) {
      return fail(CODES.INVALID, 'response was not JSON');
    }
    return { ok: true, data: data || {} };
  }

  /* =========================================================
     PUBLIC METHODS
     ========================================================= */

  /**
   * Send one conversational turn.
   * @param {string} message  the visitor's message
   * @param {Array<{role:'user'|'assistant', content:string}>} history prior turns
   * @param {Object} context  page/session snapshot from aiContext.build()
   * @returns {Promise<{ok:boolean, reply?:string, code?:string}>}
   */
  async function sendMessage(message, history, context) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) return fail(CODES.EMPTY);
    if (text.length > config.maxMessageChars) return fail(CODES.TOO_LONG);

    const result = await post(config.chatPath, {
      message: text,
      history: Array.isArray(history) ? history : [],
      context: context || {},
    });
    if (!result.ok) return result;

    const reply = result.data && typeof result.data.reply === 'string' ? result.data.reply.trim() : '';
    if (!reply) return fail(CODES.INVALID, 'no reply field in response');
    return { ok: true, reply };
  }

  /**
   * One-shot completion for the site's non-chat AI features
   * (the flag explanation and journey summary in donations.js).
   *
   * The browser sends a task name and a donation ID — nothing else.
   * The backend looks the donation up in the database and owns the
   * system prompt, so the browser dictates neither the model's
   * instructions nor the facts it reasons over.
   *
   * @param {{task:string, donationId:string}} params
   * @returns {Promise<{ok:boolean, text?:string, code?:string}>}
   */
  async function runTask(params) {
    const task = params && params.task;
    const donationId = params && params.donationId;
    if (!task || !donationId) return fail(CODES.EMPTY);

    const result = await post(config.completePath, { task, donationId });
    if (!result.ok) return result;

    const text = result.data && typeof result.data.text === 'string' ? result.data.text.trim() : '';
    if (!text) return fail(CODES.INVALID, 'no text field in response');
    return { ok: true, text };
  }

  /** Cheap liveness probe used by the panel's status dot. */
  async function health() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(config.baseUrl + config.healthPath, { signal: controller.signal });
      clearTimeout(timer);
      return { ok: res.ok };
    } catch (err) {
      return { ok: false };
    }
  }

  window.daongAiService = {
    CODES,
    config,
    sendMessage,
    runTask,
    health,
  };
})();
