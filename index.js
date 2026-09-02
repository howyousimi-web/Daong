/**
 * index.js — Cloud Functions entry point
 * ---------------------------------------------------------------
 * The deployable version of the DAONG API: same routes, same JSON
 * shapes as ../server/server.js (see that file and the project
 * README for the full contract), but Firestore-backed instead of a
 * local JSON file, and exported as a single HTTPS Cloud Function
 * rather than a long-running `app.listen()` process.
 *
 * Firebase Hosting is configured (see ../firebase.json) to rewrite
 * `/api/**` to this function and serve everything else (the HTML
 * frontend) as static files directly — so in production the
 * frontend never actually hits this function for anything but API
 * calls, keeping page loads fast off Hosting's CDN.
 * --------------------------------------------------------------- */
const express = require('express');
const cors = require('cors');
const { onRequest } = require('firebase-functions/v2/https');

const { FirestoreStore } = require('./store');
const { issueToken, requireAuth } = require('./auth');
const { requireRecaptcha } = require('./recaptcha');
const { requireAppCheck } = require('./appCheck');

const store = new FirestoreStore();

const app = express();
app.use(cors());
app.use(express.json());

// No-op unless ENABLE_APP_CHECK=true is set on the deployed function
// (firebase functions:config, or an env var via functions v2's
// runWith/environment config) — see appCheck.js and DEPLOY.md.
app.use('/api/v1', requireAppCheck);

const api = express.Router();

// Wraps an async route handler so a thrown/rejected error becomes a
// clean 500 instead of an unhandled rejection Cloud Functions logs
// as a crash. Express 4 (used here) doesn't auto-catch async errors.
const asyncRoute = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });
};

api.post('/auth/login', requireRecaptcha, asyncRoute(async (req, res) => {
  const role = req.body && req.body.role === 'admin' ? 'admin' : 'donor';
  const { token, user } = await issueToken(role);
  res.json({ token, user });
}));

api.get('/drives', asyncRoute(async (_req, res) => {
  res.json({ drives: await store.getDrives() });
}));

api.get('/donations', asyncRoute(async (_req, res) => {
  res.json({ donations: await store.getDonations() });
}));

api.post('/donations', requireAuth, asyncRoute(async (req, res) => {
  const record = await store.createDonation(req.body || {});
  const drive = record.driveId ? await store.bumpDriveTotal(record.driveId, record.amountPhp) : null;
  res.json({ donation: record, drive });
}));

api.post('/donations/pledge', requireAuth, requireRecaptcha, asyncRoute(async (req, res) => {
  const b = req.body || {};
  const record = await store.createDonation({
    driveId: b.driveId, donor: b.donor, amountPhp: b.amountPhp, category: b.category, org: b.org,
    lat: b.lat, lng: b.lng,
  });
  const drive = b.driveId ? await store.bumpDriveTotal(b.driveId, b.amountPhp) : null;
  res.json({ pledgeId: `plg-${record.id}`, status: 'received', donation: record, drive });
}));

api.post('/donations/:id/checkpoint', requireAuth, asyncRoute(async (req, res) => {
  const record = await store.addCheckpoint(decodeURIComponent(req.params.id), req.body || {});
  if (!record) return res.status(404).json({ error: 'not_found' });
  res.json({ donation: record });
}));

api.get('/donations/:id/verify', asyncRoute(async (req, res) => {
  const result = await store.verifyDonationChain(decodeURIComponent(req.params.id));
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json(result);
}));

api.post('/donations/reset-demo', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await store.reset());
}));

api.get('/notifications', (_req, res) => {
  res.json({
    notifications: [
      { id: 'ntf-1', message: 'Your pledge to Bulacan Flood Rapid Response was received.', timestamp: '2026-08-25T09:15:00+08:00', read: false },
      { id: 'ntf-2', message: 'New checkpoint logged for tracking ID TN-1001.', timestamp: '2026-08-24T18:40:00+08:00', read: false },
      { id: 'ntf-3', message: 'Special Care Facility Support reached 88% funded.', timestamp: '2026-08-22T11:02:00+08:00', read: true },
    ],
  });
});

app.use('/api/v1', api);
app.get('/', (_req, res) => res.json({ ok: true, service: 'daong-functions', apiBase: '/api/v1' }));

exports.api = onRequest({ cors: true }, app);
