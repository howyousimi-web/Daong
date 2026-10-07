/**
 * server.js
 * ---------------------------------------------------------------
 * DAONG backend — one Express app that serves:
 *
 *   /                 the frontend in ../public
 *   /api/v1/…         the application API (drives, donations, auth,
 *                     notifications, stats, contact)
 *   /api/v1/ai/…      the assistant API (chat, complete, health)
 *
 * There used to be two servers: this one, and a separate AI server
 * with its own package.json — both defaulting to port 3000 and both
 * wanting to serve the same static site, so only one could ever run.
 * The AI half is now a router (see ai/ai-routes.js) mounted here, which
 * is why the frontend can use a single same-origin '/api/v1' base and
 * needs no CORS configuration at all in the default setup.
 *
 * Run:  npm install && npm start   →  http://localhost:3000
 * ---------------------------------------------------------------
 */

// dotenv is optional: the server must still boot if it isn't installed.
try {
  // eslint-disable-next-line global-require
  require('dotenv').config();
} catch (_err) {
  /* no .env support — environment variables still work normally */
}

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { Store, STAGES } = require('./store');
const { createApiRouter } = require('./api-routes');
const { REQUIRE_RECAPTCHA } = require('./recaptcha');
const { requireAppCheck } = require('./appCheck');
const { rateLimiter } = require('./rate-limiter');
const { isConfigured: aiConfigured, MODEL: AI_MODEL } = require('./ai/ai-routes');

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const PUBLIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, '..', 'public');
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false';

// Empty means same-origin only, which is the default deployment.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const store = new Store();
const app = express();

app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 0);
app.disable('x-powered-by');

/* =========================================================
   MIDDLEWARE
   ========================================================= */
app.use(express.json({ limit: '64kb' }));

// Security headers. The connect-src/style-src allowances are the
// minimum the existing pages need: Google Fonts stylesheets, their
// font files, and inline style="" attributes already in the markup.
// No 'unsafe-eval', and connect-src stays on this origin.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
  if (process.env.DISABLE_CSP !== 'true') {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      `connect-src 'self'${CORS_ORIGINS.length ? ` ${CORS_ORIGINS.join(' ')}` : ''}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
  }
  next();
});

if (CORS_ORIGINS.length) {
  // An explicit allow-list. Bearer tokens, not cookies, so credentials
  // stay off.
  app.use(cors({
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Firebase-AppCheck'],
    credentials: false,
  }));
} else if (NODE_ENV !== 'production') {
  // Development convenience: a teammate's frontend on another port can
  // still call this API. Production defaults to same-origin only.
  app.use(cors());
}

app.use('/api/v1', rateLimiter);
app.use('/api/v1', requireAppCheck);

app.use('/api/v1', createApiRouter(store));



// Anything unmatched under /api answers JSON, never the HTML index —
// the frontend's error handling always has something it can parse.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

/* =========================================================
   STATIC FRONTEND
   ========================================================= */
if (SERVE_STATIC && fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));

  app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  // /dashboard, /track etc. resolve to the matching .html, matching how
  // the site behaves behind most static hosts.
  app.get('/:page', (req, res, next) => {
    const requested = req.params.page;
    if (!/^[a-z0-9_-]+$/i.test(requested)) return next();
    return res.sendFile(path.join(PUBLIC_DIR, `${requested}.html`), (err) => {
      if (err) next();
    });
  });
} else {
  app.get('/', (_req, res) => res.json({ ok: true, service: 'daong-backend', apiBase: '/api/v1' }));
}

/* =========================================================
   ERROR HANDLER
   Raw errors are logged, never sent: the client gets a stable
   shape and no stack trace.
   ========================================================= */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  console.error('[daong] unhandled error on %s %s:', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) return undefined;
  return res.status(500).json({ error: 'internal_error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DAONG running at http://localhost:${PORT}`);
    console.log(`  API base      : http://localhost:${PORT}/api/v1`);
    console.log(`  static site   : ${SERVE_STATIC && fs.existsSync(PUBLIC_DIR) ? PUBLIC_DIR : 'disabled'}`);
    console.log(`  AI assistant  : ${aiConfigured() ? `enabled (${AI_MODEL})` : 'DISABLED — set ANTHROPIC_API_KEY in server/.env'}`);
    console.log(`  reCAPTCHA     : ${REQUIRE_RECAPTCHA ? 'enforced' : 'off (set REQUIRE_RECAPTCHA=true to enable)'}`);
    console.log(`  CORS origins  : ${CORS_ORIGINS.length ? CORS_ORIGINS.join(', ') : 'same-origin only'}`);
  });
}

module.exports = { app, store, STAGES };
