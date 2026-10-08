(function () {
  'use strict';

  const DEFAULTS = {
    baseUrl: 'http://localhost:5001/daong-a28b8/us-central1',
    chatPath: '/ai/chat',
    completePath: '/ai/complete',
    healthPath: '/ai/health',
    timeoutMs: 30000,
    maxMessageChars: 2000,
  };

  const config = Object.assign({}, DEFAULTS, window.DAONG_AI_CONFIG || {});

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

  async function post(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    const headers = { 'Content-Type': 'application/json' };
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
