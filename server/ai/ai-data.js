/**
 * server/ai/ai-data.js
 * -----------------------------------------------------------------
 * CONTROLLED DATA RETRIEVAL FOR THE ASSISTANT
 *
 * The assistant must be able to answer "how many relief packages are
 * being delivered right now?" from the actual database rather than
 * from a stale sentence in a system prompt. This module is the only
 * path from the store into the model's context, and it is deliberately
 * a narrow one:
 *
 *   - The assistant gets NO store handle and NO query language. It
 *     gets the finished, aggregated result of the few named readers
 *     below, and nothing else.
 *   - Donor names, donor user IDs, contact messages, audit logs and
 *     auth tokens are never included at any role.
 *   - Flag detail (the weight/route/hours numbers behind a review) is
 *     coordinator information, so it is included only when the request
 *     carried a valid admin token.
 *
 * That means a visitor cannot ask the assistant to reveal something
 * the API wouldn't have shown them anyway.
 * -----------------------------------------------------------------
 */

const MAX_DRIVES = 10;
const MAX_CHECKPOINTS = 8;

/** Aggregate figures — safe at every role. */
function liveOverview(store) {
  const stats = store.getImpactStats();
  const admin = store.getAdminStats();

  return {
    trackedDonations: stats.trackedDonations,
    inTransit: stats.inTransit,
    delivered: stats.delivered,
    underReview: stats.underReview,
    byStage: admin.byStage, // [{ stage: 'In Transit', count: 2 }, …]
    totalTrackedValuePhp: stats.trackedValuePhp,
    reportedReliefValuePhp: stats.reportedReliefValuePhp,
    activeOperations: stats.activeOperations,
    individualsReached: stats.individualsReached,
    reportingPeriod: stats.reportingPeriod,
  };
}

/** Campaign progress — public information, shown on the Drives page. */
function liveDrives(store) {
  return store.getDrives().slice(0, MAX_DRIVES).map((d) => ({
    title: d.title,
    category: d.category,
    goalPhp: d.goalPhp,
    raisedPhp: d.raisedPhp,
    percentFunded: d.percentFunded,
  }));
}

/**
 * One donation's public checkpoint trail, looked up server-side.
 * The browser sends only an ID; it never supplies the record itself,
 * so a tampered client can't feed the model invented checkpoints.
 */
function lookupDonation(store, rawId, { isAdmin = false } = {}) {
  if (!rawId || typeof rawId !== 'string') return null;
  const record = store.findDonation(rawId.trim().slice(0, 20));
  if (!record) return { id: String(rawId).toUpperCase().slice(0, 20), found: false };

  const out = {
    found: true,
    id: record.id,
    amountPhp: record.amountPhp,
    category: record.category,
    org: record.org,
    date: record.date,
    status: record.status,
    currentStage: ['Received', 'Allocated', 'Dispatched', 'In Transit', 'Delivered'][record.stageIndex] || null,
    checkpoints: (record.checkpoints || []).slice(0, MAX_CHECKPOINTS).map((c) => ({
      stage: c.stage, loc: c.loc, time: c.time,
    })),
  };

  // Why-was-this-flagged detail is for coordinators only.
  if (isAdmin && record.flagReason) out.flagReason = record.flagReason;
  return out;
}

/**
 * Assembles everything the model should see for one chat turn.
 * `pageKey` and `donationId` come from the browser and are treated as
 * hints about what the visitor is looking at — the DATA itself is read
 * here, from the store.
 */
function buildLiveContext(store, { pageKey, donationId, isAdmin = false } = {}) {
  const context = {
    overview: liveOverview(store),
    activeDrives: liveDrives(store),
  };
  if (donationId) {
    const donation = lookupDonation(store, donationId, { isAdmin });
    if (donation) context.donationOnScreen = donation;
  }
  if (pageKey) context.pageKey = String(pageKey).slice(0, 30);
  return context;
}

module.exports = { buildLiveContext, lookupDonation, liveOverview, liveDrives };
