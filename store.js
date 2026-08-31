/**
 * store.js (Cloud Functions version)
 * ---------------------------------------------------------------
 * Same job as ../server/store.js — Drives, Donations, and the
 * hash-chained checkpoint logic — but backed by Cloud Firestore
 * instead of a local JSON file. Cloud Functions instances don't
 * share a filesystem and aren't guaranteed to stay warm, so a flat
 * file (fine for local `npm start`) can't work once this is actually
 * deployed; Firestore is the durable, shared store every instance
 * reads/writes the same data from.
 *
 * The hash-chain logic itself (SHA-256, genesis hash, chaining
 * function) is identical to server/store.js on purpose — the same
 * "your donation can't be silently rewritten" guarantee holds
 * whichever backend is actually running.
 * --------------------------------------------------------------- */
const crypto = require('crypto');
const admin = require('firebase-admin');

const STAGES = ['Received', 'Allocated', 'Dispatched', 'In Transit', 'Delivered'];
const GENESIS_HASH = '0'.repeat(64);

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

function seedData() {
  const drives = [
    { id: 'drv-001', title: 'Bulacan Flood Rapid Response', category: 'food', goalPhp: 500000, raisedPhp: 360000, percentFunded: 72 },
    { id: 'drv-002', title: 'Special Care Facility Support', category: 'medical', goalPhp: 350000, raisedPhp: 308000, percentFunded: 88 },
    { id: 'drv-003', title: 'Region IV-A Shelter Kits', category: 'shelter', goalPhp: 420000, raisedPhp: 126000, percentFunded: 30 },
    { id: 'drv-004', title: 'Marikina Flood Response', category: 'food', goalPhp: 300000, raisedPhp: 84000, percentFunded: 28 },
  ];

  const rawDonations = [
    {
      id: 'TN-1001', driveId: 'drv-001', donor: 'Anonymous Donor', amountPhp: 50000, category: 'Cash Relief',
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
      id: 'TN-1002', driveId: 'drv-004', donor: 'Meycauayan Community Drive', amountPhp: 18500, category: 'Food',
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
      id: 'TN-1003', driveId: 'drv-001', donor: 'St. Peter Parish Drive', amountPhp: 9200, category: 'Medicine',
      org: 'Bulacan Disaster Response', date: '2026-08-15', stageIndex: 2, status: 'transit',
      checkpoints: [
        { stage: 'Received', loc: 'Bulacan Central Warehouse', time: 'Aug 15, 09:10', lat: 14.8433, lng: 120.8113 },
        { stage: 'Allocated', loc: 'Medicine Allocation Desk', time: 'Aug 15, 11:00', lat: 14.8450, lng: 120.8130 },
      ],
    },
  ];

  const donations = rawDonations.map((d) => ({ ...d, checkpoints: chainCheckpoints(d.id, d.checkpoints) }));
  return { drives, donations, donationIdCounter: 1003 };
}

class FirestoreStore {
  constructor() {
    if (!admin.apps.length) admin.initializeApp();
    this.db = admin.firestore();
  }

  async _ensureSeeded() {
    const snap = await this.db.collection('drives').limit(1).get();
    if (!snap.empty) return;
    await this.reset();
  }

  async reset() {
    const { drives, donations, donationIdCounter } = seedData();
    const batch = this.db.batch();

    // Clear existing docs first so reset-demo genuinely resets, not just adds.
    const [existingDrives, existingDonations] = await Promise.all([
      this.db.collection('drives').get(),
      this.db.collection('donations').get(),
    ]);
    existingDrives.forEach((doc) => batch.delete(doc.ref));
    existingDonations.forEach((doc) => batch.delete(doc.ref));

    drives.forEach((d) => batch.set(this.db.collection('drives').doc(d.id), d));
    donations.forEach((d) => batch.set(this.db.collection('donations').doc(d.id), d));
    batch.set(this.db.collection('meta').doc('counters'), { donationIdCounter });

    await batch.commit();
    return { drives, donations };
  }

  async getDrives() {
    await this._ensureSeeded();
    const snap = await this.db.collection('drives').get();
    return snap.docs.map((d) => d.data());
  }

  async getDonations() {
    await this._ensureSeeded();
    const snap = await this.db.collection('donations').get();
    return snap.docs.map((d) => d.data());
  }

  async findDrive(driveId) {
    const doc = await this.db.collection('drives').doc(driveId).get();
    return doc.exists ? doc.data() : null;
  }

  async findDonation(rawId) {
    const normalized = String(rawId).toUpperCase();
    const doc = await this.db.collection('donations').doc(normalized).get();
    return doc.exists ? doc.data() : null;
  }

  async bumpDriveTotal(driveId, amountPhp) {
    const ref = this.db.collection('drives').doc(driveId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const drive = doc.data();
      drive.raisedPhp += Number(amountPhp) || 0;
      drive.percentFunded = Math.min(100, Math.round((drive.raisedPhp / drive.goalPhp) * 100));
      tx.set(ref, drive);
      return drive;
    });
  }

  async createDonation({ driveId, donor, amountPhp, category, org, intakeLocation, lat, lng }) {
    const counterRef = this.db.collection('meta').doc('counters');
    const id = await this.db.runTransaction(async (tx) => {
      const doc = await tx.get(counterRef);
      const next = ((doc.exists && doc.data().donationIdCounter) || 1003) + 1;
      tx.set(counterRef, { donationIdCounter: next }, { merge: true });
      return `TN-${next}`;
    });

    const now = new Date();
    const firstCheckpoint = {
      stage: 'Received', loc: intakeLocation || 'Central Intake Warehouse', time: phTimestamp(now),
      lat: lat ?? null, lng: lng ?? null,
    };
    const record = {
      id,
      driveId: driveId || null,
      donor: (donor || '').trim() || 'Anonymous Donor',
      amountPhp: Number(amountPhp) || 0,
      category: category || 'Cash Relief',
      org: (org || '').trim() || 'General Relief Fund',
      date: now.toISOString().slice(0, 10),
      stageIndex: 0,
      status: 'transit',
      checkpoints: chainCheckpoints(id, [firstCheckpoint]),
    };
    await this.db.collection('donations').doc(id).set(record);
    return record;
  }

  async addCheckpoint(rawId, { loc, lat, lng } = {}) {
    const normalized = String(rawId).toUpperCase();
    const ref = this.db.collection('donations').doc(normalized);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const record = doc.data();
      record.stageIndex = Math.min(record.stageIndex + 1, STAGES.length - 1);
      const nextStage = STAGES[record.stageIndex];
      const previousHash = record.checkpoints.length
        ? record.checkpoints[record.checkpoints.length - 1].hash
        : GENESIS_HASH;
      const [stamped] = chainCheckpoints(
        record.id,
        [{ stage: nextStage, loc: loc || 'Field Checkpoint (manual log)', time: phTimestamp(new Date()), lat: lat ?? null, lng: lng ?? null }],
        previousHash,
      );
      record.checkpoints.push(stamped);
      if (nextStage === 'Delivered') record.status = 'verified';
      tx.set(ref, record);
      return record;
    });
  }

  async verifyDonationChain(rawId) {
    const record = await this.findDonation(rawId);
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
}

module.exports = { FirestoreStore, STAGES };
