/**
 * js/ai/aiAssistant.js
 * -----------------------------------------------------------------
 * DAONG AI ASSISTANT — ORCHESTRATION LAYER
 *
 * Sits between the chat UI and the transport layer:
 *   1. owns the conversation for the length of the browsing session,
 *   2. attaches the page/session context from aiContext.js,
 *   3. calls aiService.sendMessage(),
 *   4. turns error codes into plain-language sentences a visitor can act on.
 *
 * Conversation memory
 *   Kept in sessionStorage so the thread survives navigation between
 *   DAONG's pages (this is a multi-page site — a plain in-memory array
 *   would reset on every link click) and is wiped when the tab closes.
 *   Nothing is written to localStorage, no server-side transcript is
 *   kept, and "Clear" removes it immediately.
 *
 * Exposes: window.daongAiAssistant
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'daong_ai_conversation';
  const MAX_STORED_TURNS = 20; // ~10 exchanges kept across page loads
  const MAX_SENT_TURNS = 10;   // what actually travels to the backend

  const FRIENDLY = {
    EMPTY_MESSAGE: 'Type a message first and I\u2019ll take a look.',
    MESSAGE_TOO_LONG: 'That message is a bit long for me \u2014 could you shorten it and send again?',
    TIMEOUT: 'That took longer than expected. Please try sending it again.',
    NETWORK: 'I can\u2019t reach the assistant service right now. Check your connection and try again.',
    BACKEND_UNAVAILABLE: 'The assistant service isn\u2019t responding at the moment. Please try again shortly.',
    RATE_LIMITED: 'A lot of questions have come in at once. Please wait a moment and try again.',
    SERVER_ERROR: 'Sorry, I\u2019m having trouble connecting right now. Please try again.',
    INVALID_RESPONSE: 'I got a reply I couldn\u2019t read. Please try asking again.',
    FORBIDDEN: 'That explanation is a coordinator tool \u2014 please log in as a coordinator to see it.',
    NOT_FOUND: 'I couldn\u2019t find that donation record. Please check the ID and try again.',
    NOT_CONFIGURED:
      'The assistant isn\u2019t connected to its backend yet. Start the server in /server and set ANTHROPIC_API_KEY \u2014 see AI_INTEGRATION.md.',
  };

  function friendly(code) {
    return FRIENDLY[code] || FRIENDLY.SERVER_ERROR;
  }

  /* =========================================================
     CONVERSATION STORE
     ========================================================= */
  function load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter(isTurn) : [];
    } catch (err) {
      return [];
    }
  }

  function isTurn(t) {
    return t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string';
  }

  let turns = load();

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-MAX_STORED_TURNS)));
    } catch (err) {
      /* storage full or blocked — the thread simply won't survive navigation */
    }
  }

  function record(role, content) {
    turns.push({ role, content });
    if (turns.length > MAX_STORED_TURNS) turns = turns.slice(-MAX_STORED_TURNS);
    persist();
  }

  /* =========================================================
     ASK
     ========================================================= */
  /**
   * @param {string} message
   * @returns {Promise<{ok:boolean, reply:string, code?:string}>}
   *          `reply` is always a display-ready string, success or not.
   */
  async function ask(message) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) return { ok: false, code: 'EMPTY_MESSAGE', reply: friendly('EMPTY_MESSAGE') };

    if (!window.daongAiService) {
      return { ok: false, code: 'NOT_CONFIGURED', reply: friendly('NOT_CONFIGURED') };
    }

    // Context is best-effort: a failure to read the page must never
    // block the question from being asked.
    let context = {};
    try {
      if (window.daongAiContext) context = await window.daongAiContext.build();
    } catch (err) {
      context = {};
    }

    // History is sent *before* the new message is recorded, so the
    // backend receives prior turns plus `message` exactly once.
    const history = turns.slice(-MAX_SENT_TURNS);
    const result = await window.daongAiService.sendMessage(text, history, context);

    if (!result.ok) {
      // Failed turns are not written to memory — a retry then starts
      // from a clean, consistent thread.
      return { ok: false, code: result.code, reply: friendly(result.code) };
    }

    record('user', text);
    record('assistant', result.reply);
    return { ok: true, reply: result.reply };
  }

  function getHistory() {
    return turns.slice();
  }

  function reset() {
    turns = [];
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* nothing to clean up */
    }
  }

  window.daongAiAssistant = {
    ask,
    reset,
    getHistory,
    friendly,
  };
})();
