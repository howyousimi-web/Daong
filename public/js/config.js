/**
 * config.js
 * ---------------------------------------------------------------
 * The one place the frontend learns where its backend is. Loaded
 * before every other script, so apiService.js and js/ai/aiService.js
 * both read the same value instead of each hardcoding a URL.
 *
 * The default is same-origin: the Express server in /server serves
 * these pages and the API together, so '/api/v1' resolves correctly
 * with no configuration at all — in development and in production.
 *
 * If you host the frontend separately (Netlify, GitHub Pages, Live
 * Server…) point it at your API host by defining DAONG_CONFIG BEFORE
 * this file in each page:
 *
 *   <script>window.DAONG_CONFIG = { apiBaseUrl: 'https://api.example.com/api/v1' };</script>
 *   <script src="js/config.js"></script>
 *
 * …and add that page's origin to CORS_ORIGINS in server/.env.
 *
 * Nothing secret belongs in this file. It is served to every visitor.
 * API keys live in the server's environment; the browser never sees
 * them. `recaptchaSiteKey` is safe here if you use it — site keys are
 * public by design, unlike the secret key, which stays server-side.
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
