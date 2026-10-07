/**
 * functions/index.js — Cloud Functions entry point
 * ---------------------------------------------------------------
 * The deployable form of the DAONG API: the SAME routes as the local
 * Express server, backed by Firestore instead of a JSON file.
 *
 * This file used to redeclare every endpoint itself, which is how the
 * two copies drifted apart — the function's versions had none of the
 * validation, role checks or audit routes the Express server had, and
 * it imported ./store, ./auth and ./recaptcha, none of which existed
 * in this folder, so it could not start at all.
 *
 * Now there is one router (server/api-routes.js) and one set of
 * handlers; only the storage backend differs. Run
 * `npm run build:functions` from the project root before deploying —
 * it copies server/ in here, because Firebase uploads only this
 * directory.
 * --------------------------------------------------------------- */
const express = require('express');
const cors = require('cors');
const { onRequest } = require('firebase-functions/v2/https');

const { createApiRouter } = require('./server/api-routes');
const auth = require('./server/auth');
const { requireAppCheck } = require('./server/appCheck');
const { rateLimiter } = require('./server/rate-limiter');
const { FirestoreStore, firestoreTokenBackend } = require('./store-firestore');

const store = new FirestoreStore();

// Tokens must live in Firestore: Cloud Functions instances have no
// shared or durable disk, so the default file backend would issue a
// token on one instance that every other instance rejects.
auth.configure(firestoreTokenBackend());

const app = express();

// Lock this down to your Hosting domains before real traffic. Same-origin
// requests through the /api/** rewrite don't need CORS at all.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(CORS_ORIGINS.length ? cors({ origin: CORS_ORIGINS, credentials: false }) : cors());

app.use(express.json({ limit: '64kb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api/v1', rateLimiter);
app.use('/api/v1', requireAppCheck);
app.use('/api/v1', createApiRouter(store));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.get('/', (_req, res) => res.json({ ok: true, service: 'daong-functions', apiBase: '/api/v1' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  console.error('[daong-fn]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) return undefined;
  return res.status(500).json({ error: 'internal_error' });
});

exports.api = onRequest({ cors: true }, app);
