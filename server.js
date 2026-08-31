/**
 * server.js
 * ---------------------------------------------------------------
 * DAONG backend. Works two ways at once:
 *
 *  1. As the complete app: serves the bundled frontend (../public)
 *     AND the /api/v1 API from one Express process / one origin, so
 *     apiService.js's relative API_BASE_URL ('/api/v1') just works
 *     with no CORS setup needed.
 *
 *  2. As a standalone API: CORS is wide open (`cors()` with no
 *     options), so a *different* frontend — a teammate's separate
 *     React/Vue/whatever app on another origin/port — can call this
 *     same server directly. Nothing below assumes the caller is the
 *     bundled public/ frontend. Lock `origin` down to your real
 *     frontend's domain before deploying this anywhere public — see
 *     the TODO a few lines down.
 *
 * Every route returns exactly the JSON shape apiService.js's own
 * mock already returns (see public/js/apiService.js's MOCKS /
 * dynamicMockFor) — that contract was designed first, this backend
 * implements it for real, on disk (see store.js), instead of an
 * in-memory object that resets on page reload. Full route-by-route
 * reference is in README.md.
 * --------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { Store, STAGES } = require('./store');
const { issueToken, requireAuth } = require('./auth');
const { requireRecaptcha } = require('./recaptcha');
const { requireAppCheck } = require('./appCheck');

const PORT = process.env.PORT || 3000;
const store = new Store();

const app = express();

// TODO before deploying for real: replace with
//   app.use(cors({ origin: 'https://your-frontend-domain.com' }));
app.use(cors());
app.use(express.json());

// Firebase App Check — no-op unless ENABLE_APP_CHECK=true (see appCheck.js).
// Applied to the whole API so it can eventually cover every route without
// each one remembering to opt in.
app.use('/api/v1', requireAppCheck);

const api = express.Router();

/* ---------- auth ---------- */
// Demo-role login: no real credential check, matches a "pick your role"
// login UI (see AuthStateManager.login() in public/js/app.js). Returns
// { token, user }. Send the token back as `Authorization: Bearer <token>`
// on the write routes below.
api.post('/auth/login', (req, res) => {
  const role = req.body && req.body.role === 'admin' ? 'admin' : 'donor';
  const { token, user } = issueToken(role);
  res.json({ token, user });
});

/* ---------- drives (public read) ---------- */
api.get('/drives', (_req, res) => {
  res.json({ drives: store.getDrives() });
});

/* ---------- donations ---------- */
api.get('/donations', (_req, res) => {
  res.json({ donations: store.getDonations() });
});

// Register a donation directly (e.g. an admin/coordinator intake form).
// Coordinators are already authenticated, so this route trusts requireAuth
// rather than also demanding a reCAPTCHA solve.
api.post('/donations', requireAuth, (req, res) => {
  const record = store.createDonation(req.body || {});
  const drive = record.driveId ? store.bumpDriveTotal(record.driveId, record.amountPhp) : null;
  res.json({ donation: record, drive });
});

// A citizen pledging to a specific Drive — the public-facing donation
// path, so it's the one gated by the visible reCAPTCHA checkbox on the
// pledge form (see requireRecaptcha / public/js/pages.js's pledge flow).
api.post('/donations/pledge', requireAuth, requireRecaptcha, (req, res) => {
  const b = req.body || {};
  const record = store.createDonation({
    driveId: b.driveId, donor: b.donor, amountPhp: b.amountPhp, category: b.category, org: b.org,
    lat: b.lat, lng: b.lng,
  });
  const drive = b.driveId ? store.bumpDriveTotal(b.driveId, b.amountPhp) : null;
  res.json({ pledgeId: `plg-${record.id}`, status: 'received', donation: record, drive });
});

// Advances a donation to its next lifecycle stage (Received → Allocated →
// Dispatched → In Transit → Delivered), stamping a new hash-chained
// checkpoint. Marks the donation 'verified' once it reaches Delivered.
// Optional { loc, lat, lng } in the body pins where this checkpoint
// actually happened, for the tracking map.
api.post('/donations/:id/checkpoint', requireAuth, (req, res) => {
  const record = store.addCheckpoint(decodeURIComponent(req.params.id), req.body || {});
  if (!record) return res.status(404).json({ error: 'not_found' });
  res.json({ donation: record });
});

// Recomputes every checkpoint's hash for a donation and confirms the
// chain still links correctly, proving no checkpoint was silently
// edited or deleted after the fact. Not called by the current frontend
// UI, but available for an admin tool or a future "Verify" button.
api.get('/donations/:id/verify', (req, res) => {
  const result = store.verifyDonationChain(decodeURIComponent(req.params.id));
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json(result);
});

// Wipes all donations/drives back to the seed demo data. Handy for
// resetting between demo runs; remove or gate this behind a stronger
// check before any real deployment.
api.post('/donations/reset-demo', requireAuth, (_req, res) => {
  res.json(store.reset());
});

/* ---------- notifications ---------- */
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

/* ---------- static frontend (optional) ---------- */
// Only wired up if public/ actually exists — so this same server.js
// still runs correctly as a pure API if you strip public/ out to hand
// the backend to a team using their own separate frontend.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));

  // Direct navigation to /dashboard, /track, etc. (no .html) resolves to
  // the matching page, matching how the site would sit behind most static
  // hosts/reverse proxies.
  app.get('/:page', (req, res, next) => {
    const filePath = path.join(PUBLIC_DIR, `${req.params.page}.html`);
    res.sendFile(filePath, (err) => { if (err) next(); });
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'daong-backend', apiBase: '/api/v1' });
  });
}

app.listen(PORT, () => {
  console.log(`DAONG running at http://localhost:${PORT}`);
  console.log(`API base:        http://localhost:${PORT}/api/v1`);
});

module.exports = { app, STAGES };
