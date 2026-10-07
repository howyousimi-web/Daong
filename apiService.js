/**
 * apiService.js
 * ---------------------------------------------------------------
 * The ONLY file that talks to the DAONG backend. app.js, pages.js and
 * donations.js call methods here and never see a URL, a header or an
 * HTTP status code.
 *
 * This file used to carry a complete in-memory mock database — seed
 * drives, seed donations, a fake login, an ID counter — and fell back
 * to it whenever a request failed. That made a broken backend look
 * like a working app: the page filled with data that existed only in
 * the tab, and vanished on reload. The mocks are gone. Every method
 * below is a real request to the real API, and a failure is reported
 * as a failure so the UI can say so.
 *
 * Every method resolves (never throws) to:
 *   { ok: true,  status: 'OK', data }
 *   { ok: false, status: <code>, error, errors?, message }
 * where `message` is always safe to show a user, and `status` is one
 * of the STATUS values below.
 * --------------------------------------------------------------- */

const API_BASE_URL = (window.DAONG_CONFIG && window.DAONG_CONFIG.apiBaseUrl) || '/api/v1';
const REQUEST_TIMEOUT_MS = (window.DAONG_CONFIG && window.DAONG_CONFIG.requestTimeoutMs) || 15000;

const TOKEN_KEY = 'daong_auth_token';
const USER_KEY = 'daong_auth_user';

const STATUS = {
  OK: 'OK',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
};

// One friendly sentence per failure mode. Raw backend errors and status
// codes go to the console for developers, never to the page.
const MESSAGES = {
  VALIDATION_ERROR: 'Please check the details you entered and try again.',
  AUTH_EXPIRED: 'Your session has ended. Please log in again.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: 'That action has already been completed.',
  RATE_LIMITED: 'Too many requests just now. Please wait a moment and try again.',
  SERVER_ERROR: 'Something went wrong on our side. Please try again shortly.',
  NETWORK_ERROR: "We can't reach the DAONG server. Check your connection and try again.",
  TIMEOUT: 'That request took too long. Please try again.',
};

/* =========================================================
   TOKEN STORE
   ========================================================= */
const TokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* storage unavailable */ }
  },
  getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* noop */ }
  },
};

function failure(status, extra) {
  return Object.assign({
    ok: false,
    status,
    data: null,
    message: MESSAGES[status] || MESSAGES.SERVER_ERROR,
  }, extra || {});
}

function statusFromHttp(httpStatus) {
  if (httpStatus === 400) return STATUS.VALIDATION_ERROR;
  if (httpStatus === 401) return STATUS.AUTH_EXPIRED;
  if (httpStatus === 403) return STATUS.FORBIDDEN;
  if (httpStatus === 404) return STATUS.NOT_FOUND;
  if (httpStatus === 409) return STATUS.CONFLICT;
  if (httpStatus === 429) return STATUS.RATE_LIMITED;
  return STATUS.SERVER_ERROR;
}

/**
 * The one function that calls fetch(). Adds the auth header, a timeout,
 * and turns every outcome into the shape described at the top.
 */
async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = TokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') return failure(STATUS.TIMEOUT);
    console.warn('[apiService] network error on', method, path, err && err.message);
    document.dispatchEvent(new CustomEvent('daong:network-error', { detail: { path } }));
    return failure(STATUS.NETWORK_ERROR);
  }
  clearTimeout(timer);

  // Parse first: the API answers JSON on errors too, and the body
  // carries the field-level validation detail.
  let payload = null;
  try {
    const text = await res.text();
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    if (res.ok) {
      console.warn('[apiService] non-JSON success body from', path);
      return failure(STATUS.SERVER_ERROR);
    }
  }

  if (res.ok) return { ok: true, status: STATUS.OK, data: payload || {} };

  const status = statusFromHttp(res.status);

  if (status === STATUS.AUTH_EXPIRED) {
    TokenStore.clear();
    document.dispatchEvent(new CustomEvent('daong:auth-expired'));
  }

  console.warn('[apiService]', method, path, '→ HTTP', res.status, payload && payload.error);
  return failure(status, {
    error: (payload && payload.error) || null,
    errors: (payload && payload.errors) || null,
    data: payload || null,
  });
}

/* =========================================================
   PUBLIC METHODS — one per backend route
   ========================================================= */
const apiService = {
  TokenStore,
  STATUS,
  STAGES: ['Received', 'Allocated', 'Dispatched', 'In Transit', 'Delivered'],

  /* ---- config ---- */
  getConfig() {
    return request('GET', '/config');
  },

  /* ---- auth ---- */
  async login(credentials) {
    const result = await request('POST', '/auth/login', credentials);
    if (result.ok && result.data.token) {
      TokenStore.set(result.data.token);
      TokenStore.setUser(result.data.user);
    }
    return result;
  },

  // Revokes the token server-side before clearing it locally, so a
  // copied token stops working the moment the user logs out.
  async logout() {
    const hadToken = !!TokenStore.get();
    if (hadToken) await request('POST', '/auth/logout');
    TokenStore.clear();
    document.dispatchEvent(new CustomEvent('daong:logged-out'));
    return { ok: true, status: STATUS.OK, data: null };
  },

  getMe() {
    return request('GET', '/auth/me');
  },

  /* ---- drives ---- */
  getDrives() {
    return request('GET', '/drives');
  },

  /* ---- donations ---- */
  getDonations() {
    return request('GET', '/donations');
  },

  getDonation(id) {
    return request('GET', `/donations/${encodeURIComponent(id)}`);
  },

  createDonation(payload) {
    return request('POST', '/donations', payload);
  },

  pledgeDonation(pledge) {
    return request('POST', '/donations/pledge', pledge);
  },

  logDonationCheckpoint(id, details) {
    return request('POST', `/donations/${encodeURIComponent(id)}/checkpoint`, details || {});
  },

  verifyDonationChain(id) {
    return request('GET', `/donations/${encodeURIComponent(id)}/verify`);
  },

  resetDemoData() {
    return request('POST', '/donations/reset-demo', {});
  },

  /* ---- notifications ---- */
  getNotifications() {
    return request('GET', '/notifications');
  },

  markNotificationRead(id) {
    return request('PATCH', `/notifications/${encodeURIComponent(id)}/read`);
  },

  /* ---- statistics ---- */
  getImpactStats() {
    return request('GET', '/stats/impact');
  },

  getMySummary() {
    return request('GET', '/me/summary');
  },

  getAdminStats() {
    return request('GET', '/admin/stats');
  },

  /* ---- contact ---- */
  submitContact(payload) {
    return request('POST', '/contact', payload);
  },
};

// Available to app.js/pages.js/donations.js (plain <script> tags, no imports)
window.apiService = apiService;
