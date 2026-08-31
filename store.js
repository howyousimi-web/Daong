/**
 * store.js
 * ---------------------------------------------------------------
 * The DAONG data layer: Drives and Donations, persisted to a JSON
 * file on disk (data/db.json) so state survives a server restart —
 * unlike the frontend's own in-browser mock, which resets on reload.
 *
 * Seeded with the exact same demo data the frontend's apiService.js
 * mock ships with, so switching from "mock" to "real backend" is
 * seamless: same drive IDs, same TN-100x tracking IDs, same story.
 *
 * Every checkpoint appended to a donation is chained with a SHA-256
 * hash of the previous checkpoint + its own data (same tamper-evident
 * pattern as the original ReliefLedger prototype this project grew
 * out of). The frontend doesn't render these fields, but they make
 * the "your donation can't be silently rewritten" claim verifiable
 * rather than just asserted — see verifyDonationChain() below.
 * --------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
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

function seed() {
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

// Stamps each checkpoint in a fresh list with previousHash/hash, chained
// from GENESIS_HASH — used both for seeding and for appending one new
// checkpoint to an existing (already-chained) list.
function chainCheckpoints(donationId, checkpoints, startingPreviousHash) {
  let previousHash = startingPreviousHash || GENESIS_HASH;
  return checkpoints.map((cp) => {
    const hash = checkpointHash(previousHash, donationId, cp);
    const stamped = { ...cp, previousHash, hash };
    previousHash = hash;
    return stamped;
  });
}

class Store {
  constructor() {
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = seed();
      this._save();
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
  }

  reset() {
    this.data = seed();
    this._save();
    return { drives: this.data.drives, donations: this.data.donations };
  }

  getDrives() {
    return this.data.drives;
  }

  getDonations() {
    return this.data.donations;
  }

  findDrive(driveId) {
    return this.data.drives.find((d) => d.id === driveId) || null;
  }

  findDonation(rawId) {
    const normalized = String(rawId).toUpperCase();
    return this.data.donations.find((d) => d.id.toUpperCase() === normalized) || null;
  }

  bumpDriveTotal(driveId, amountPhp) {
    const drive = this.findDrive(driveId);
    if (!drive) return null;
    drive.raisedPhp += Number(amountPhp) || 0;
    drive.percentFunded = Math.min(100, Math.round((drive.raisedPhp / drive.goalPhp) * 100));
    return drive;
  }

  createDonation({ driveId, donor, amountPhp, category, org, intakeLocation, lat, lng }) {
    this.data.donationIdCounter += 1;
    const id = `TN-${this.data.donationIdCounter}`;
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
    this.data.donations.push(record);
    this._save();
    return record;
  }

  addCheckpoint(rawId, { loc, lat, lng } = {}) {
    const record = this.findDonation(rawId);
    if (!record) return null;
    record.stageIndex = Math.min(record.stageIndex + 1, STAGES.length - 1);
    const nextStage = STAGES[record.stageIndex];
    const previousHash = record.checkpoints.length
      ? record.checkpoints[record.checkpoints.length - 1].hash
      : GENESIS_HASH;
    const [stamped] = chainCheckpoints(
      record.id,
      [{
        stage: nextStage, loc: loc || 'Field Checkpoint (manual log)', time: phTimestamp(new Date()),
        lat: lat ?? null, lng: lng ?? null,
      }],
      previousHash,
    );
    record.checkpoints.push(stamped);
    if (nextStage === 'Delivered') record.status = 'verified';
    this._save();
    return record;
  }

  // Recomputes every checkpoint hash for a donation and confirms the
  // chain still links correctly — the same "Verify Chain" proof the
  // original ReliefLedger UI exposed, available here as an API for
  // an admin tool or future UI to call.
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
}

module.exports = { Store, STAGES };
