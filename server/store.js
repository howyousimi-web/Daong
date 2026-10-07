/**
 * store.js
 * ---------------------------------------------------------------------
 * The data layer. Owns data/db.json and is the ONLY module that writes
 * it — auth tokens deliberately live in their own file (data/tokens.json,
 * see auth.js) because two modules rewriting one file from separate
 * in-memory copies silently destroyed each other's data.
 *
 * Everything the API serves comes from here: drives, donations,
 * notifications, contact messages and the impact figures. Nothing is
 * duplicated in the frontend.
 *
 * Checkpoints stay hash-chained: every appended checkpoint is stamped
 * with SHA-256(previousHash + donationId + stage + loc + time + coords),
 * so verifyDonationChain() can prove no checkpoint was edited after the
 * fact.
 * --------------------------------------------------------------------- */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STAGES = ['Received', 'Allocated', 'Dispatched', 'In Transit', 'Delivered'];
const GENESIS_HASH = '0'.repeat(64);

const DATA_DIR = process.env.DAONG_DATA_DIR
  ? path.resolve(process.env.DAONG_DATA_DIR)
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function phTimestamp(d) {
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

function checkpointHash(previousHash, donationId, cp) {
  const payload = JSON.stringify({
    previousHash, donationId, stage: cp.stage, loc: cp.loc, time: cp.time,
    lat: cp.lat ?? null, lng: cp.lng ?? null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function chainCheckpoints(donationId, checkpoints, startingPreviousHash) {
  let previousHash = startingPreviousHash || GENESIS_HASH;
  return checkpoints.map((cp) => {
    const hash = checkpointHash(previousHash, donationId, cp);
    const stamped = { ...cp, previousHash, hash };
    previousHash = hash;
    return stamped;
  });
}

/* =========================================================
   SEED DATA
   The demo dataset. Two donations are attributed to the demo
   donor account (usr-100) so the dashboard's contribution
   history and totals are real database rows rather than
   numbers typed into the HTML.
   ========================================================= */
function seedData() {
  const drives = [
    { id: 'drv-001', title: 'Bulacan Flood Rapid Response', category: 'food', goalPhp: 500000, raisedPhp: 360000, percentFunded: 72 },
    { id: 'drv-002', title: 'Special Care Facility Support', category: 'medical', goalPhp: 350000, raisedPhp: 308000, percentFunded: 88 },
    { id: 'drv-003', title: 'Region IV-A Shelter Kits', category: 'shelter', goalPhp: 420000, raisedPhp: 126000, percentFunded: 30 },
    { id: 'drv-004', title: 'Marikina Flood Response', category: 'food', goalPhp: 300000, raisedPhp: 84000, percentFunded: 28 },
  ];

  const rawDonations = [
    {
      id: 'TN-1001', driveId: 'drv-001', donor: 'Anonymous Donor', donorUserId: null, amountPhp: 50000, category: 'Cash Relief',
      org: 'Bulacan Disaster Response', date: '2026-08-15', stageIndex: 3, status: 'flagged',
      flagReason: { hoursSinceLastCheckpoint: 31, expectedWeight: 8.4, currentWeight: 6.9, routeDeviationKm: 3.8 },
      checkpoints: [
        { stage: 'Received', loc: 'Bulacan Central Warehouse', time: 'Aug 15, 08:02', lat: 14.8433, lng: 120.8113 },
        { stage: 'Allocated', loc: 'Food & Medicine Allocation Desk', time: 'Aug 15, 10:15', lat: 14.8450, lng: 120.8130 },
        { stage: 'Dispatched', loc: 'Loading Bay 3', time: 'Aug 15, 13:40', lat: 14.8470, lng: 120.8150 },
        { stage: 'In Transit', loc: 'Checkpoint — San Rafael Junction', time: 'Aug 15, 16:05', lat: 14.9155, lng: 120.9470 },
      ],
    },
    {
      id: 'TN-1002', driveId: 'drv-004', donor: 'Meycauayan Community Drive', donorUserId: null, amountPhp: 18500, category: 'Food',
      org: 'Marikina Flood Response', date: '2026-08-14', stageIndex: 4, status: 'verified',
      checkpoints: [
        { stage: 'Received', loc: 'Marikina Sports Complex', time: 'Aug 14, 07:20', lat: 14.6349, lng: 121.1029 },
        { stage: 'Allocated', loc: 'Relief Goods Allocation', time: 'Aug 14, 09:00', lat: 14.6360, lng: 121.1040 },
        { stage: 'Dispatched', loc: 'Loading Bay 1', time: 'Aug 14, 11:30', lat: 14.6370, lng: 121.1050 },
        { stage: 'In Transit', loc: 'Barangay Sto. Niño Access Rd.', time: 'Aug 14, 13:10', lat: 14.6500, lng: 121.1100 },
        { stage: 'Delivered', loc: 'Barangay Sto. Niño Evac. Center', time: 'Aug 14, 15:45', lat: 14.6520, lng: 121.1120 },
      ],
    },
    {
      id: 'TN-1003', driveId: 'drv-001', donor: 'St. Peter Parish Drive', donorUserId: null, amountPhp: 9200, category: 'Medicine',
      org: 'Bulacan Disaster Response', date: '2026-08-15', stageIndex: 2, status: 'transit',
      checkpoints: [
        { stage: 'Received', loc: 'Bulacan Central Warehouse', time: 'Aug 15, 09:10', lat: 14.8433, lng: 120.8113 },
        { stage: 'Allocated', loc: 'Medicine Allocation Desk', time: 'Aug 15, 11:00', lat: 14.8450, lng: 120.8130 },
      ],
    },
    {
      id: 'TN-1004', driveId: 'drv-001', donor: 'Guest Volunteer', donorUserId: 'usr-100', amountPhp: 5000, category: 'Cash Relief',
      org: 'Bulacan Flood Rapid Response', date: '2026-08-20', stageIndex: 4, status: 'verified',
      checkpoints: [
        { stage: 'Received', loc: 'Bulacan Central Warehouse', time: 'Aug 20, 08:40', lat: 14.8433, lng: 120.8113 },
        { stage: 'Allocated', loc: 'Cash Relief Desk', time: 'Aug 20, 10:05', lat: 14.8450, lng: 120.8130 },
        { stage: 'Dispatched', loc: 'Loading Bay 2', time: 'Aug 20, 12:15', lat: 14.8470, lng: 120.8150 },
        { stage: 'In Transit', loc: 'Plaridel Junction', time: 'Aug 20, 14:30', lat: 14.8880, lng: 120.8570 },
        { stage: 'Delivered', loc: 'Barangay Banga Evacuation Center', time: 'Aug 20, 16:50', lat: 14.9010, lng: 120.8620 },
      ],
    },
    {
      id: 'TN-1005', driveId: 'drv-002', donor: 'Guest Volunteer', donorUserId: 'usr-100', amountPhp: 7500, category: 'Medicine',
      org: 'Special Care Facility Support', date: '2026-08-22', stageIndex: 4, status: 'verified',
      checkpoints: [
        { stage: 'Received', loc: 'Central Medical Intake', time: 'Aug 22, 09:00', lat: 14.6760, lng: 121.0437 },
        { stage: 'Allocated', loc: 'Medicine Allocation Desk', time: 'Aug 22, 10:20', lat: 14.6770, lng: 121.0450 },
        { stage: 'Dispatched', loc: 'Loading Bay 1', time: 'Aug 22, 12:00', lat: 14.6780, lng: 121.0460 },
        { stage: 'In Transit', loc: 'Ortigas Ave. Corridor', time: 'Aug 22, 13:45', lat: 14.6100, lng: 121.0700 },
        { stage: 'Delivered', loc: 'Special Care Facility, Cainta', time: 'Aug 22, 15:30', lat: 14.5780, lng: 121.1220 },
      ],
    },
  ];

  return {
    drives,
    donations: rawDonations.map((d) => ({
      ...d,
      checkpoints: chainCheckpoints(d.id, d.checkpoints),
      auditLog: [{ action: 'seeded', timestamp: '2026-08-25T00:00:00.000Z', user: 'system', details: {} }],
    })),
    notifications: [
      { id: 'ntf-1', userId: 'usr-100', message: 'Your pledge to Bulacan Flood Rapid Response was received.', timestamp: '2026-08-25T09:15:00+08:00', read: false },
      { id: 'ntf-2', userId: null, message: 'New checkpoint logged for tracking ID TN-1001.', timestamp: '2026-08-24T18:40:00+08:00', read: false },
      { id: 'ntf-3', userId: null, message: 'Special Care Facility Support reached 88% funded.', timestamp: '2026-08-22T11:02:00+08:00', read: true },
    ],
    contactMessages: [],
    // Aggregate field figures shown on Info & Impact and the home page.
    // These are reported through the mobile intake app across the whole
    // programme, which is a wider dataset than the tracked demo
    // donations above — they live here so the API serves them from the
    // database instead of the numbers being typed into the HTML.
    impact: {
      reportedReliefValuePhp: 4200000,
      activeOperations: 18,
      individualsReached: 7340,
      reportingPeriod: '2026',
    },
    notificationIdCounter: 3,
    donationIdCounter: 1005,
  };
}

function ensureShape(parsed) {
  const seeded = seedData();
  if (!parsed || typeof parsed !== 'object') return seeded;
  if (!Array.isArray(parsed.drives) || !Array.isArray(parsed.donations)) return seeded;
  // Older db.json files predate these collections — fill them in rather
  // than throwing the user's existing donations away.
  return {
    drives: parsed.drives,
    donations: parsed.donations,
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : seeded.notifications,
    contactMessages: Array.isArray(parsed.contactMessages) ? parsed.contactMessages : [],
    impact: parsed.impact && typeof parsed.impact === 'object' ? parsed.impact : seeded.impact,
    notificationIdCounter: Number(parsed.notificationIdCounter) || seeded.notificationIdCounter,
    donationIdCounter: Number(parsed.donationIdCounter) || seeded.donationIdCounter,
  };
}

function loadState() {
  try {
    return ensureShape(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (_err) {
    const seeded = seedData();
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(seeded, null, 2));
    } catch (writeErr) {
      console.warn('[store] could not write %s — running from memory only:', DATA_FILE, writeErr.message);
    }
    return seeded;
  }
}

/* =========================================================
   PROJECTIONS
   Donor names, flag details and audit trails are coordinator
   information. The public read routes serve the trimmed
   version so a scrape of GET /donations can't harvest who
   gave what.
   ========================================================= */
function publicDonation(d) {
  return {
    id: d.id,
    driveId: d.driveId,
    amountPhp: d.amountPhp,
    category: d.category,
    org: d.org,
    date: d.date,
    stageIndex: d.stageIndex,
    status: d.status,
    checkpoints: (d.checkpoints || []).map((c) => ({
      stage: c.stage, loc: c.loc, time: c.time, lat: c.lat ?? null, lng: c.lng ?? null, hash: c.hash,
    })),
  };
}

function adminDonation(d) {
  return { ...d };
}

class Store {
  constructor() {
    this.state = loadState();
  }

  persist() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      // Write-then-rename so a crash mid-write can't leave a truncated
      // db.json that the next boot would discard as corrupt.
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error('[store] persist failed:', err.message);
    }
  }

  /* ---------- drives ---------- */
  getDrives() {
    return this.state.drives;
  }

  findDrive(driveId) {
    return this.state.drives.find((d) => d.id === driveId) || null;
  }

  bumpDriveTotal(driveId, amountPhp) {
    const drive = this.findDrive(driveId);
    if (!drive) return null;
    drive.raisedPhp += Number(amountPhp) || 0;
    drive.percentFunded = Math.min(100, Math.round((drive.raisedPhp / drive.goalPhp) * 100));
    this.persist();
    return drive;
  }

  /* ---------- donations ---------- */
  getDonations({ includePrivate = false } = {}) {
    return this.state.donations.map((d) => (includePrivate ? adminDonation(d) : publicDonation(d)));
  }

  findDonation(rawId) {
    const normalized = String(rawId).toUpperCase();
    return this.state.donations.find((d) => d.id.toUpperCase() === normalized) || null;
  }

  getDonationsForUser(userId) {
    if (!userId) return [];
    return this.state.donations.filter((d) => d.donorUserId === userId);
  }

  createDonation({ driveId, donor, amountPhp, category, org, intakeLocation, lat, lng, createdBy, donorUserId } = {}) {
    const nextId = this.state.donationIdCounter + 1;
    this.state.donationIdCounter = nextId;
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

    this.state.donations.push(record);
    this.persist();
    return record;
  }

  addCheckpoint(rawId, { loc, lat, lng, updatedBy } = {}) {
    const record = this.findDonation(rawId);
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

    this.persist();
    return { alreadyComplete: false, donation: record };
  }

  verifyDonationChain(rawId) {
    const record = this.findDonation(rawId);
    if (!record) return null;

    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < record.checkpoints.length; i += 1) {
      const cp = record.checkpoints[i];
      const recomputed = checkpointHash(expectedPrev, record.id, cp);
      if (recomputed !== cp.hash || cp.previousHash !== expectedPrev) {
        return { isIntact: false, checkpointsChecked: i + 1 };
      }
      expectedPrev = cp.hash;
    }
    return { isIntact: true, checkpointsChecked: record.checkpoints.length };
  }

  /* ---------- notifications ---------- */
  // userId null on a notification means "everyone"; a signed-out visitor
  // sees only those.
  getNotifications(userId) {
    return this.state.notifications
      .filter((n) => n.userId === null || (userId && n.userId === userId))
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  markNotificationRead(id, userId) {
    const n = this.state.notifications.find((x) => x.id === id);
    if (!n) return null;
    if (n.userId !== null && n.userId !== userId) return null;
    n.read = true;
    this.persist();
    return n;
  }

  addNotification({ userId = null, message }) {
    this.state.notificationIdCounter += 1;
    const n = {
      id: `ntf-${this.state.notificationIdCounter}`,
      userId: userId || null,
      message: String(message).slice(0, 300),
      timestamp: new Date().toISOString(),
      read: false,
    };
    this.state.notifications.push(n);
    this.persist();
    return n;
  }

  /* ---------- contact ---------- */
  addContactMessage({ name, email, message }) {
    const record = {
      id: `msg-${Date.now().toString(36)}`,
      name: String(name).trim().slice(0, 200),
      email: String(email).trim().slice(0, 200),
      message: String(message).trim().slice(0, 4000),
      receivedAt: new Date().toISOString(),
    };
    this.state.contactMessages.push(record);
    this.persist();
    return record;
  }

  /* ---------- statistics ---------- */
  // Public aggregate figures for Info & Impact and the home page.
  // The programme-level totals come from state.impact; the review count
  // is computed live so it always matches what's actually flagged.
  getImpactStats() {
    const donations = this.state.donations;
    const impact = this.state.impact || {};
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
      activeDrives: this.state.drives.length,
    };
  }

  // The signed-in donor's own dashboard numbers and history.
  getUserSummary(user) {
    const mine = this.getDonationsForUser(user.id);
    const notifications = this.getNotifications(user.id);
    return {
      totalPledgedPhp: mine.reduce((sum, d) => sum + (Number(d.amountPhp) || 0), 0),
      drivesSupported: new Set(mine.map((d) => d.driveId).filter(Boolean)).size,
      unreadNotifications: notifications.filter((n) => !n.read).length,
      history: mine
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((d) => ({
          id: d.id,
          org: d.org,
          driveId: d.driveId,
          amountPhp: d.amountPhp,
          status: d.status,
          date: d.date,
        })),
    };
  }

  getAdminStats() {
    const donations = this.state.donations;
    return {
      totalDonations: donations.length,
      totalRaisedPhp: donations.reduce((sum, d) => sum + (Number(d.amountPhp) || 0), 0),
      byStatus: {
        transit: donations.filter((d) => d.status === 'transit').length,
        flagged: donations.filter((d) => d.status === 'flagged').length,
        verified: donations.filter((d) => d.status === 'verified').length,
      },
      byStage: STAGES.map((stage, i) => ({
        stage,
        count: donations.filter((d) => d.stageIndex === i).length,
      })),
      drives: this.state.drives.map((d) => ({
        id: d.id, title: d.title, raisedPhp: d.raisedPhp, goalPhp: d.goalPhp, percentFunded: d.percentFunded,
      })),
      contactMessages: this.state.contactMessages.length,
    };
  }

  reset() {
    this.state = seedData();
    this.persist();
    return { drives: this.state.drives, donations: this.state.donations.map(publicDonation) };
  }
}

module.exports = {
  Store,
  STAGES,
  DATA_FILE,
  publicDonation,
  adminDonation,
  chainCheckpoints,
  checkpointHash,
  phTimestamp,
  seedData,
};
