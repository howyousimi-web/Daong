/**
 * api-routes.js
 * ---------------------------------------------------------------
 * THE single definition of the DAONG API. Both deployment targets
 * mount this same router:
 *
 *   server/server.js    → local/self-hosted Express, flat-file Store
 *   functions/index.js  → Firebase Cloud Function, FirestoreStore
 *
 * There is deliberately no second copy of these routes. The Cloud
 * Function used to redeclare every endpoint itself, which is how the
 * two drifted apart (it never got the validation, the role checks or
 * the audit routes the Express server had).
 *
 * The store is injected, and every store call is awaited, so the same
 * handlers work against a synchronous in-process store and an
 * asynchronous Firestore one without changes. Awaiting a plain value
 * is a no-op, so the local path pays nothing for it.
 * --------------------------------------------------------------- */
const express = require('express');

const { requireAuth, requireAdmin, optionalAuth, issueToken, revokeToken } = require('./auth');
const { requireRecaptcha, REQUIRE_RECAPTCHA, SITE_KEY } = require('./recaptcha');
const { validateDonation, validateCheckpoint, validateContact, MIN_AMOUNT, MAX_AMOUNT } = require('./validators');
const { publicDonation, STAGES } = require('./store');
const { createAiRouter, isConfigured: aiConfigured } = require('./ai/ai-routes');

function fail(res, status, error, extra) {
  return res.status(status).json(Object.assign({ error }, extra || {}));
}

/**
 * @param {object} store  anything implementing the Store interface
 *                        (sync or promise-returning)
 */
function createApiRouter(store) {
  const api = express.Router();

  // Express 4 doesn't catch rejected promises from async handlers — an
  // unhandled rejection would take the process down instead of answering.
  const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  /* =========================================================
     CONFIG — public runtime values. Never a secret: only
     whether a feature is switched on.
     ========================================================= */
  api.get('/config', (_req, res) => {
    res.json({
      apiVersion: 'v1',
      aiEnabled: aiConfigured(),
      recaptcha: { required: REQUIRE_RECAPTCHA, siteKey: REQUIRE_RECAPTCHA ? SITE_KEY : null },
      limits: { minAmountPhp: MIN_AMOUNT, maxAmountPhp: MAX_AMOUNT },
      stages: STAGES,
    });
  });

  /* =========================================================
     AUTH — demo-role login matching the site's login buttons.
     ========================================================= */
  api.post('/auth/login', requireRecaptcha('LOGIN'), route(async (req, res) => {
    const role = req.body && req.body.role === 'admin' ? 'admin' : 'donor';
    const { token, user } = await issueToken(role);
    res.json({ token, user });
  }));

  // Real server-side logout: the token is revoked, not merely forgotten
  // by the browser. Logout used to be client-only, so a copied token
  // stayed valid for its full 24-hour life afterwards.
  api.post('/auth/logout', requireAuth, route(async (req, res) => {
    await revokeToken(req.token);
    res.json({ ok: true });
  }));

  api.get('/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  /* =========================================================
     DRIVES
     ========================================================= */
  api.get('/drives', route(async (_req, res) => {
    res.json({ drives: await store.getDrives() });
  }));

  api.get('/drives/:id', route(async (req, res) => {
    const drive = await store.findDrive(req.params.id);
    if (!drive) return fail(res, 404, 'not_found');
    return res.json({ drive });
  }));

  /* =========================================================
     DONATIONS
     Reads are public — the Track page needs no login. What comes
     back depends on role: coordinators get donor names and flag
     detail, everyone else gets the tracking view only.
     ========================================================= */
  api.get('/donations', optionalAuth, route(async (req, res) => {
    const isAdmin = !!(req.user && req.user.role === 'admin');
    res.json({ donations: await store.getDonations({ includePrivate: isAdmin }) });
  }));

  api.get('/donations/:id', optionalAuth, route(async (req, res) => {
    const record = await store.findDonation(decodeURIComponent(req.params.id));
    if (!record) return fail(res, 404, 'not_found');
    const isAdmin = !!(req.user && req.user.role === 'admin');
    return res.json({ donation: isAdmin ? record : publicDonation(record) });
  }));

  api.get('/donations/:id/verify', route(async (req, res) => {
    const result = await store.verifyDonationChain(decodeURIComponent(req.params.id));
    if (!result) return fail(res, 404, 'not_found');
    return res.json(result);
  }));

  api.get('/donations/:id/audit', requireAdmin, route(async (req, res) => {
    const donation = await store.findDonation(decodeURIComponent(req.params.id));
    if (!donation) return fail(res, 404, 'not_found');
    return res.json({ donationId: donation.id, auditLog: donation.auditLog || [] });
  }));

  // Coordinator intake form. Already behind a coordinator token, so no
  // reCAPTCHA on top of it.
  api.post('/donations', requireAdmin, route(async (req, res) => {
    const body = req.body || {};
    const validation = validateDonation(body);
    if (!validation.valid) return fail(res, 400, 'validation_failed', { errors: validation.errors });

    if (body.driveId && !(await store.findDrive(body.driveId))) {
      return fail(res, 400, 'validation_failed', { errors: ['driveId: unknown drive'] });
    }

    const record = await store.createDonation({
      driveId: body.driveId,
      donor: body.donor,
      amountPhp: body.amountPhp,
      category: body.category,
      org: body.org,
      lat: body.lat,
      lng: body.lng,
      createdBy: req.user.email,
    });
    const drive = record.driveId ? await store.bumpDriveTotal(record.driveId, record.amountPhp) : null;
    return res.json({ donation: record, drive });
  }));

  // A citizen pledging to a drive. Attributed to the signed-in account
  // so it appears in their dashboard history.
  api.post('/donations/pledge', requireAuth, requireRecaptcha('PLEDGE'), route(async (req, res) => {
    const body = req.body || {};
    const validation = validateDonation(body);
    if (!validation.valid) return fail(res, 400, 'validation_failed', { errors: validation.errors });

    const drive = body.driveId ? await store.findDrive(body.driveId) : null;
    if (body.driveId && !drive) {
      return fail(res, 400, 'validation_failed', { errors: ['driveId: unknown drive'] });
    }

    const record = await store.createDonation({
      driveId: body.driveId,
      // The donor label comes from the session, not the request body: a
      // pledge can't be filed under someone else's name.
      donor: req.user.name,
      donorUserId: req.user.id,
      amountPhp: body.amountPhp,
      category: body.category || 'Cash Relief',
      org: drive ? drive.title : 'General Relief Fund',
      lat: body.lat,
      lng: body.lng,
      createdBy: req.user.email,
    });

    const updatedDrive = record.driveId ? await store.bumpDriveTotal(record.driveId, record.amountPhp) : null;
    await store.addNotification({
      userId: req.user.id,
      message: `Your pledge to ${record.org} was received and is tracked as ${record.id}.`,
    });

    return res.json({ pledgeId: `plg-${record.id}`, status: 'received', donation: record, drive: updatedDrive });
  }));

  // Advances a donation one stage and stamps a hash-chained checkpoint.
  // `loc` is optional: the dashboard button collects no location and the
  // store supplies a default. Requiring it made that button fail every time.
  api.post('/donations/:id/checkpoint', requireAdmin, route(async (req, res) => {
    const validation = validateCheckpoint(req.body || {});
    if (!validation.valid) return fail(res, 400, 'validation_failed', { errors: validation.errors });

    const result = await store.addCheckpoint(decodeURIComponent(req.params.id), {
      loc: req.body && req.body.loc,
      lat: req.body && req.body.lat,
      lng: req.body && req.body.lng,
      updatedBy: req.user.email,
    });

    if (!result) return fail(res, 404, 'not_found');
    if (result.alreadyComplete) return fail(res, 409, 'already_delivered', { donation: result.donation });

    const donation = result.donation;
    await store.addNotification({ message: `New checkpoint logged for tracking ID ${donation.id}.` });
    return res.json({ donation });
  }));

  // Restores the seed dataset. Coordinator-only: it destroys every
  // donation anyone has created.
  api.post('/donations/reset-demo', requireAdmin, route(async (_req, res) => {
    res.json(await store.reset());
  }));

  /* =========================================================
     NOTIFICATIONS
     ========================================================= */
  api.get('/notifications', optionalAuth, route(async (req, res) => {
    res.json({ notifications: await store.getNotifications(req.user && req.user.id) });
  }));

  api.patch('/notifications/:id/read', requireAuth, route(async (req, res) => {
    const updated = await store.markNotificationRead(req.params.id, req.user.id);
    if (!updated) return fail(res, 404, 'not_found');
    return res.json({ notification: updated });
  }));

  /* =========================================================
     STATISTICS
     ========================================================= */
  api.get('/stats/impact', route(async (_req, res) => {
    res.json({ stats: await store.getImpactStats() });
  }));

  api.get('/me/summary', requireAuth, route(async (req, res) => {
    res.json({ summary: await store.getUserSummary(req.user) });
  }));

  api.get('/admin/stats', requireAdmin, route(async (_req, res) => {
    res.json({ stats: await store.getAdminStats() });
  }));

  /* =========================================================
     CONTACT
     ========================================================= */
  api.post('/contact', route(async (req, res) => {
    const validation = validateContact(req.body || {});
    if (!validation.valid) return fail(res, 400, 'validation_failed', { errors: validation.errors });

    const record = await store.addContactMessage(req.body);
    // The stored message isn't echoed back: no reason to reflect a
    // visitor's own input into a response.
    return res.status(201).json({ ok: true, id: record.id });
  }));

  /* =========================================================
     ASSISTANT
     ========================================================= */
  api.use('/ai', createAiRouter(store));

  return api;
}

module.exports = { createApiRouter };
