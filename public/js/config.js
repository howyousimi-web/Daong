/**
 * config.js
 * ---------------------------------------------------------------
 * The one place the frontend learns where its backend is. Loaded
 * before every other script, so apiService.js and js/ai/aiService.js
 * both read the same value instead of each hardcoding a URL.
 *
 * For a Firebase Hosting-only deployment (no Cloud Functions / no Blaze
 * plan), set this to your separate API domain, for example:
 *
 *   <script>window.DAONG_CONFIG = { apiBaseUrl: 'https://api.example.com/api/v1' };</script>
 *   <script src="js/config.js"></script>
 *
 * If your API is served from the same origin, you can leave this as
 * '/api/v1'. Otherwise, use your own API host and add that origin to the
 * backend CORS allowlist.
 * --------------------------------------------------------------- */
(function () {
  'use strict';

  var defaults = {
    apiBaseUrl: '/api/v1',
    requestTimeoutMs: 15000,
    // Only needed if you turn on REQUIRE_RECAPTCHA server-side.
    recaptchaSiteKey: null,
  };

  var existing = window.DAONG_CONFIG || {};
  var config = {};
  Object.keys(defaults).forEach(function (key) {
    config[key] = existing[key] !== undefined ? existing[key] : defaults[key];
  });
  window.DAONG_CONFIG = config;

  // The assistant's transport layer takes the same base URL, so there
  // is one thing to change when the API moves, not two.
  window.DAONG_AI_CONFIG = Object.assign(
    { baseUrl: config.apiBaseUrl, timeoutMs: 30000 },
    window.DAONG_AI_CONFIG || {}
  );
})();
