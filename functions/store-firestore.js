/**
 * functions/store-firestore.js
 * ---------------------------------------------------------------
 * The Firestore implementation of the Store interface.
 *
 * Cloud Functions instances have no durable writable disk (only an
 * ephemeral /tmp that dies with the instance and isn't shared between
 * them), so the flat-file store that server/ uses locally cannot work
 * once deployed. The previous functions/index.js imported
 * `FirestoreStore` from store.js — but that was just an alias for the
 * flat-file class, so a deployed function would have silently lost
 * every write. This is a real Firestore implementation.
 *
 * Method-for-method identical to server/store.js, but every method is
 * async. server/api-routes.js awaits every store call, so the exact
 * same routes run against either.
 *
 * Layout: one document per collection-ish blob, which keeps this at
 * hackathon scale and cost. Split donations into their own collection
 * before this handles serious volume.
 * --------------------------------------------------------------- */
const admin = require('firebase-admin');

const {
  STAGES, publicDonation, adminDonation, chainCheckpoints, checkpointHash, phTimestamp, seedData,
} = require('./server/store');

const GENESIS_HASH = '0'.repeat(64);
const COLLECTION = 'daong';
const STATE_DOC = 'state';

if (!admin.apps.length) admin.initializeApp();

class FirestoreStore {
  constructor() {
    this.db = admin.firestore();
    this.ref = this.db.collection(COLLECTION).doc(STATE_DOC);
  }

  // Seeds on first use, so a fresh project needs no manual import step.
  async _read() {
    const snap = await this.ref.get();
    if (!snap.exists) {
      const seeded = seedData();
      await this.ref.set(seeded);
      return seeded;
    }
    return snap.data();
  }

  async _write(state) {
    await this.ref.set(state);
    return state;
  }

  /* ---------- drives ---------- */
  async getDrives() {
    return (await this._read()).drives;
  }

  async findDrive(driveId) {
    return (await this._read()).drives.find((d) => d.id === driveId) || null;
  }

  async bumpDriveTotal(driveId, amountPhp) {
    const state = await this._read();
    const drive = state.drives.find((d) => d.id === driveId);
    if (!drive) return null;
    drive.raisedPhp += Number(amountPhp) || 0;
    drive.percentFunded = Math.min(100, Math.round((drive.raisedPhp / drive.goalPhp) * 100));
    await this._write(state);
    return drive;
  }

  /* ---------- donations ---------- */
  async getDonations({ includePrivate = false } = {}) {
    const state = await this._read();
    return state.donations.map((d) => (includePrivate ? adminDonation(d) : publicDonation(d)));
  }

  async findDonation(rawId) {
    const normalized = String(rawId).toUpperCase();
    const state = await this._read();
    return state.donations.find((d) => d.id.toUpperCase() === normalized) || null;
  }

  async getDonationsForUser(userId) {
    if (!userId) return [];
    return (await this._read()).donations.filter((d) => d.donorUserId === userId);
  }

  async createDonation({ driveId, donor, amountPhp, category, org, intakeLocation, lat, lng, createdBy, donorUserId } = {}) {
    const state = await this._read();
    const nextId = state.donationIdCounter + 1;
    state.donationIdCounter = nextId;
    const id = `TN-${nextId}`;
    const now = new Date();
    const cleanDonor = (donor || '').trim() || 'Anonymous Donor';

    const record = {
      id,
      driveId: driveId || null,
      donor: cleanDonor,
      donorUserId: donorUserId || null,
      amountPhp: Number(amountPhp) || 0,
      category: category || 'Cash Relief',
      org: (org || '').trim() || 'General Relief Fund',
      date: now.toISOString().slice(0, 10),
      stageIndex: 0,
      status: 'transit',
      checkpoints: chainCheckpoints(id, [{
        stage: 'Received',
        loc: intakeLocation || 'Central Intake Warehouse',
        time: phTimestamp(now),
        lat: lat ?? null,
        lng: lng ?? null,
      }]),
      auditLog: [{
        action: 'created',
        timestamp: now.toISOString(),
        user: createdBy || 'system',
        details: { amountPhp: Number(amountPhp) || 0, donor: cleanDonor, org: org || null },
      }],
    };

    state.donations.push(record);
    await this._write(state);
    return record;
  }

  async addCheckpoint(rawId, { loc, lat, lng, updatedBy } = {}) {
    const state = await this._read();
    const normalized = String(rawId).toUpperCase();
    const record = state.donations.find((d) => d.id.toUpperCase() === normalized);
    if (!record) return null;
    if (record.stageIndex >= STAGES.length - 1) return { alreadyComplete: true, donation: record };

    record.stageIndex += 1;
    const nextStage = STAGES[record.stageIndex];
    const previousHash = record.checkpoints.length
      ? record.checkpoints[record.checkpoints.length - 1].hash
      : GENESIS_HASH;

    const [stamped] = chainCheckpoints(record.id, [{
      stage: nextStage,
      loc: (loc && String(loc).trim()) || 'Field Checkpoint (manual log)',
      time: phTimestamp(new Date()),
      lat: lat ?? null,
      lng: lng ?? null,
    }], previousHash);

    record.checkpoints.push(stamped);
    if (nextStage === 'Delivered') record.status = 'verified';

    if (!record.auditLog) record.auditLog = [];
    record.auditLog.push({
      action: 'checkpoint_added',
      stage: nextStage,
      timestamp: new Date().toISOString(),
      user: updatedBy || 'system',
      details: { loc: stamped.loc, lat: stamped.lat, lng: stamped.lng },
    });

    await this._write(state);
    return { alreadyComplete: false, donation: record };
  }

  async verifyDonationChain(rawId) {
    const record = await this.findDonation(rawId);
    if (!record) return null;

    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < record.checkpoints.length; i += 1) {
      const cp = record.checkpoints[i];
      if (checkpointHash(expectedPrev, record.id, cp) !== cp.hash || cp.previousHash !== expectedPrev) {
        return { isIntact: false, checkpointsChecked: i + 1 };
      }
      expectedPrev = cp.hash;
    }
    return { isIntact: true, checkpointsChecked: record.checkpoints.length };
  }

  /* ---------- notifications ---------- */
  async getNotifications(userId) {
    const state = await this._read();
    return (state.notifications || [])
      .filter((n) => n.userId === null || (userId && n.userId === userId))
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async markNotificationRead(id, userId) {
    const state = await this._read();
    const n = (state.notifications || []).find((x) => x.id === id);
    if (!n) return null;
    if (n.userId !== null && n.userId !== userId) return null;
    n.read = true;
    await this._write(state);
    return n;
  }

  async addNotification({ userId = null, message }) {
    const state = await this._read();
    state.notificationIdCounter = (state.notificationIdCounter || 0) + 1;
    const n = {
      id: `ntf-${state.notificationIdCounter}`,
      userId: userId || null,
      message: String(message).slice(0, 300),
      timestamp: new Date().toISOString(),
      read: false,
    };
    state.notifications.push(n);
    await this._write(state);
    return n;
  }

  /* ---------- contact ---------- */
  async addContactMessage({ name, email, message }) {
    const state = await this._read();
    const record = {
      id: `msg-${Date.now().toString(36)}`,
      name: String(name).trim().slice(0, 200),
      email: String(email).trim().slice(0, 200),
      message: String(message).trim().slice(0, 4000),
      receivedAt: new Date().toISOString(),
    };
    state.contactMessages = state.contactMessages || [];
    state.contactMessages.push(record);
    await this._write(state);
    return record;
  }

  /* ---------- statistics ---------- */
  async getImpactStats() {
    const state = await this._read();
    const donations = state.donations;
    const impact = state.impact || {};
    return {
      reportedReliefValuePhp: impact.reportedReliefValuePhp || 0,
      activeOperations: impact.activeOperations || 0,
      individualsReached: impact.individualsReached || 0,
      reportingPeriod: impact.reportingPeriod || String(new Date().getFullYear()),
      underReview: donations.filter((d) => d.status === 'flagged').length,
      trackedDonations: donations.length,
      trackedValuePhp: donations.reduce((sum, d) => sum + (Number(d.amountPhp) || 0), 0),
      inTransit: donations.filter((d) => d.status === 'transit').length,
      delivered: donations.filter((d) => d.status === 'verified').length,
      activeDrives: state.drives.length,
    };
  }

  async getUserSummary(user) {
    const mine = await this.getDonationsForUser(user.id);
    const notifications = await this.getNotifications(user.id);
    return {
      totalPledgedPhp: mine.reduce((sum, d) => sum + (Number(d.amountPhp) || 0), 0),
      drivesSupported: new Set(mine.map((d) => d.driveId).filter(Boolean)).size,
      unreadNotifications: notifications.filter((n) => !n.read).length,
      history: mine
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((d) => ({
          id: d.id, org: d.org, driveId: d.driveId, amountPhp: d.amountPhp, status: d.status, date: d.date,
        })),
    };
  }

  async getAdminStats() {
    const state = await this._read();
    const donations = state.donations;
    return {
      totalDonations: donations.length,
      totalRaisedPhp: donations.reduce((sum, d) => sum + (Number(d.amountPhp) || 0), 0),
      byStatus: {
        transit: donations.filter((d) => d.status === 'transit').length,
        flagged: donations.filter((d) => d.status === 'flagged').length,
        verified: donations.filter((d) => d.status === 'verified').length,
      },
      byStage: STAGES.map((stage, i) => ({ stage, count: donations.filter((d) => d.stageIndex === i).length })),
      drives: state.drives.map((d) => ({
        id: d.id, title: d.title, raisedPhp: d.raisedPhp, goalPhp: d.goalPhp, percentFunded: d.percentFunded,
      })),
      contactMessages: (state.contactMessages || []).length,
    };
  }

  async reset() {
    const seeded = seedData();
    await this._write(seeded);
    return { drives: seeded.drives, donations: seeded.donations.map(publicDonation) };
  }
}

/**
 * Token persistence for auth.js. Same shape as the local file backend,
 * stored in Firestore so tokens survive a cold start and are shared
 * across concurrent function instances.
 */
function firestoreTokenBackend() {
  const ref = admin.firestore().collection(COLLECTION).doc('tokens');
  return {
    async load() {
      const snap = await ref.get();
      return snap.exists ? (snap.data().tokens || {}) : {};
    },
    async save(tokens) {
      await ref.set({ tokens });
    },
  };
}

module.exports = { FirestoreStore, firestoreTokenBackend };
