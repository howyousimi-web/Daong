/**
 * apiService.js
 * ---------------------------------------------------------------
 * This is the ONLY file that talks to the backend (or, until a real
 * backend exists, the ONLY file that simulates one). Every fetch()
 * call to the DAONG API lives here, so app.js/pages.js/donations.js
 * never have to know about URLs, headers, or error codes ΓÇö they
 * just call a method like apiService.getDrives().
 *
 * If the backend is unreachable (not deployed yet, offline, etc.)
 * this falls back to an in-memory mock "database" so the prototype
 * is fully demonstrable before the real API exists. The mock store
 * is stateful for the lifetime of the page (creating a donation or
 * logging a checkpoint actually persists until reload) so the demo
 * behaves like a real backend would, just without a server.
 * --------------------------------------------------------------- */

// Use the same-origin local backend for the app design this repo is built around.
// This keeps the frontend and API working together in local development and in the
// same deployment environment without a separate external backend host.
const API_BASE_URL = '/api/v1';
const USE_MOCKS_ON_FAILURE = true;

const TOKEN_KEY = 'daong_auth_token';
const USER_KEY = 'daong_auth_user';

// Handles saving/reading the login token and user info in the browser
const TokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* storage unavailable */ }
  },
  getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* noop */ }
  },
};

function cloneDeep(x) { return JSON.parse(JSON.stringify(x)); }

function phTimestamp(d) {
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* =========================================================
   STATEFUL MOCK "DATABASE" ΓÇö donations & drives
   Simulated persistence for the demo. A real backend replaces
   this object wholesale; nothing above the request() layer
   needs to change when that happens.
   ========================================================= */
const STAGES = ['Received', 'Allocated', 'Dispatched', 'In Transit', 'Delivered'];

let mockDrivesDb = [
  { id: 'drv-001', title: 'Bulacan Flood Rapid Response', category: 'food', goalPhp: 500000, raisedPhp: 360000, percentFunded: 72 },
  { id: 'drv-002', title: 'Special Care Facility Support', category: 'medical', goalPhp: 350000, raisedPhp: 308000, percentFunded: 88 },
  { id: 'drv-003', title: 'Region IV-A Shelter Kits', category: 'shelter', goalPhp: 420000, raisedPhp: 126000, percentFunded: 30 },
  { id: 'drv-004', title: 'Marikina Flood Response', category: 'food', goalPhp: 300000, raisedPhp: 84000, percentFunded: 28 },
];

// Seed donations ported from the TANAW prototype, now linked to a driveId
// so each pledge belongs to a real campaign instead of floating on its own.
let mockDonationsDb = [
  {
    id: 'TN-1001', driveId: 'drv-001', donor: 'Anonymous Donor', amountPhp: 50000, category: 'Cash Relief',
    org: 'Bulacan Disaster Response', date: '2026-08-15', stageIndex: 3, status: 'flagged',
    flagReason: { hoursSinceLastCheckpoint: 31, expectedWeight: 8.4, currentWeight: 6.9, routeDeviationKm: 3.8 },
    checkpoints: [
      { stage: 'Received', loc: 'Bulacan Central Warehouse', time: 'Aug 15, 08:02' },
      { stage: 'Allocated', loc: 'Food & Medicine Allocation Desk', time: 'Aug 15, 10:15' },
      { stage: 'Dispatched', loc: 'Loading Bay 3', time: 'Aug 15, 13:40' },
      { stage: 'In Transit', loc: 'Checkpoint ΓÇö San Rafael Junction', time: 'Aug 15, 16:05' },
    ],
  },
  {
    id: 'TN-1002', driveId: 'drv-004', donor: 'Meycauayan Community Drive', amountPhp: 18500, category: 'Food',
    org: 'Marikina Flood Response', date: '2026-08-14', stageIndex: 4, status: 'verified',
    checkpoints: [
      { stage: 'Received', loc: 'Marikina Sports Complex', time: 'Aug 14, 07:20' },
      { stage: 'Allocated', loc: 'Relief Goods Allocation', time: 'Aug 14, 09:00' },
      { stage: 'Dispatched', loc: 'Loading Bay 1', time: 'Aug 14, 11:30' },
      { stage: 'In Transit', loc: 'Barangay Sto. Ni├▒o Access Rd.', time: 'Aug 14, 13:10' },
      { stage: 'Delivered', loc: 'Barangay Sto. Ni├▒o Evac. Center', time: 'Aug 14, 15:45' },
    ],
  },
  {
    id: 'TN-1003', driveId: 'drv-001', donor: 'St. Peter Parish Drive', amountPhp: 9200, category: 'Medicine',
    org: 'Bulacan Disaster Response', date: '2026-08-15', stageIndex: 2, status: 'transit',
    checkpoints: [
      { stage: 'Received', loc: 'Bulacan Central Warehouse', time: 'Aug 15, 09:10' },
      { stage: 'Allocated', loc: 'Medicine Allocation Desk', time: 'Aug 15, 11:00' },
    ],
  },
];

let mockDonationIdCounter = 1003;

const SEED_DRIVES = cloneDeep(mockDrivesDb);
const SEED_DONATIONS = cloneDeep(mockDonationsDb);
const SEED_ID_COUNTER = mockDonationIdCounter;

function resetMockData() {
  mockDrivesDb = cloneDeep(SEED_DRIVES);
  mockDonationsDb = cloneDeep(SEED_DONATIONS);
  mockDonationIdCounter = SEED_ID_COUNTER;
}

function findDrive(driveId) {
  return mockDrivesDb.find((d) => d.id === driveId);
}
function findDonation(id) {
  const normalized = String(id).toUpperCase();
  return mockDonationsDb.find((d) => d.id.toUpperCase() === normalized);
}

function createDonationRecord({ driveId, donor, amountPhp, category, org, intakeLocation }) {
  mockDonationIdCounter += 1;
  const id = `TN-${mockDonationIdCounter}`;
  const now = new Date();
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
    checkpoints: [{ stage: 'Received', loc: intakeLocation || 'Central Intake Warehouse', time: phTimestamp(now) }],
  };
  mockDonationsDb.push(record);
  return record;
}

function bumpDriveTotal(driveId, amountPhp) {
  const drive = findDrive(driveId);
  if (!drive) return null;
  drive.raisedPhp += Number(amountPhp) || 0;
  drive.percentFunded = Math.min(100, Math.round((drive.raisedPhp / drive.goalPhp) * 100));
  return drive;
}

// Static mocks for endpoints that don't need stateful mutation
const MOCKS = {
  'GET /notifications': {
    notifications: [
      { id: 'ntf-1', message: 'Your pledge to Bulacan Flood Rapid Response was received.', timestamp: '2026-08-25T09:15:00+08:00', read: false },
      { id: 'ntf-2', message: 'New checkpoint logged for tracking ID TN-1001.', timestamp: '2026-08-24T18:40:00+08:00', read: false },
      { id: 'ntf-3', message: 'Special Care Facility Support reached 88% funded.', timestamp: '2026-08-22T11:02:00+08:00', read: true },
    ],
  },
};

const DEMO_USERS = {
  donor: { id: 'usr-100', name: 'Guest Volunteer', email: 'guest@example.com', role: 'donor' },
  admin: { id: 'usr-900', name: 'J. Santos', email: 'coordinator@daong.org.ph', role: 'admin' },
};

function mockFor(method, path) {
  const key = `${method} ${path}`;
  return MOCKS[key] !== undefined ? cloneDeep(MOCKS[key]) : null;
}

// Handles every donation/drive endpoint that needs real (simulated)
// persistence rather than a static canned response. Returns null when
// the route doesn't match, so the caller falls back to mockFor().
function dynamicMockFor(method, path, body) {
  if (method === 'POST' && path === '/auth/login') {
    const role = body && body.role === 'admin' ? 'admin' : 'donor';
    return { token: `mock.jwt.${role}`, user: cloneDeep(DEMO_USERS[role]) };
  }

  if (method === 'GET' && path === '/drives') {
    return { drives: cloneDeep(mockDrivesDb) };
  }

  if (method === 'GET' && path === '/donations') {
    return { donations: cloneDeep(mockDonationsDb) };
  }

  if (method === 'POST' && path === '/donations') {
    const record = createDonationRecord(body || {});
    // A donation linked to a Drive counts toward that Drive's raised total too,
    // whether it came in through the admin intake form or a citizen pledge.
    const drive = record.driveId ? bumpDriveTotal(record.driveId, record.amountPhp) : null;
    return { donation: cloneDeep(record), drive: drive ? cloneDeep(drive) : null };
  }

  const cpMatch = path.match(/^\/donations\/([^/]+)\/checkpoint$/);
  if (method === 'POST' && cpMatch) {
    const record = findDonation(decodeURIComponent(cpMatch[1]));
    if (!record) return { error: 'not_found' };
    record.stageIndex = Math.min(record.stageIndex + 1, STAGES.length - 1);
    const nextStage = STAGES[record.stageIndex];
    record.checkpoints.push({ stage: nextStage, loc: 'Field Checkpoint (manual log)', time: phTimestamp(new Date()) });
    if (nextStage === 'Delivered') record.status = 'verified';
    return { donation: cloneDeep(record) };
  }

  if (method === 'POST' && path === '/donations/pledge') {
    const b = body || {};
    const record = createDonationRecord({
      driveId: b.driveId, donor: b.donor, amountPhp: b.amountPhp, category: b.category, org: b.org,
    });
    const drive = b.driveId ? bumpDriveTotal(b.driveId, b.amountPhp) : null;
    return { pledgeId: `plg-${record.id}`, status: 'received', donation: cloneDeep(record), drive: drive ? cloneDeep(drive) : null };
  }

  if (method === 'POST' && path === '/donations/reset-demo') {
    resetMockData();
    return { donations: cloneDeep(mockDonationsDb), drives: cloneDeep(mockDrivesDb) };
  }

  return null;
}

/**
 * The one function that actually calls fetch(). Everything else in this
 * file calls this instead of calling fetch() directly.
 * Returns: { ok, status: 'OK' | 'AUTH_EXPIRED' | 'NETWORK_ERROR' | 'SERVER_ERROR', data, usedMock }
 */
async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = TokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      TokenStore.clear();
      document.dispatchEvent(new CustomEvent('daong:auth-expired'));
      return { ok: false, status: 'AUTH_EXPIRED', data: null, usedMock: false };
    }
    if (!res.ok) {
      return { ok: false, status: 'SERVER_ERROR', data: null, usedMock: false };
    }
    const data = await res.json();
    return { ok: true, status: 'OK', data, usedMock: false };
  } catch (err) {
    // Backend not reachable (expected until one is deployed) ΓÇö fall back to
    // mock data quietly. Only surface a "connection issue" banner to the
    // user if there's truly no mock available either, so a fully-mocked
    // demo doesn't look broken on every page load.
    if (USE_MOCKS_ON_FAILURE) {
      const dyn = dynamicMockFor(method, path, body);
      if (dyn) return { ok: true, status: 'OK', data: dyn, usedMock: true };
      const mock = mockFor(method, path);
      if (mock) return { ok: true, status: 'OK', data: mock, usedMock: true };
    }
    document.dispatchEvent(new CustomEvent('daong:network-error', { detail: { path } }));
    return { ok: false, status: 'NETWORK_ERROR', data: null, usedMock: false };
  }
}

// Public methods used by app.js/pages.js/donations.js ΓÇö one per backend route
const apiService = {
  TokenStore,
  STAGES,

  getDrives() {
    return request('GET', '/drives');
  },

  getNotifications() {
    return request('GET', '/notifications');
  },

  async login(credentials) {
    const payload = { ...credentials };
    if (!payload.recaptchaToken) {
      payload.recaptchaToken = null;
    }

    const result = await request('POST', '/auth/login', payload);
    if (result.ok) {
      TokenStore.set(result.data.token);
      TokenStore.setUser(result.data.user);
    }
    return result;
  },

  logout() {
    TokenStore.clear();
    document.dispatchEvent(new CustomEvent('daong:logged-out'));
  },

  pledgeDonation(pledge) {
    return request('POST', '/donations/pledge', pledge);
  },

  getDonations() {
    return request('GET', '/donations');
  },

  createDonation(payload) {
    return request('POST', '/donations', payload);
  },

  logDonationCheckpoint(id) {
    return request('POST', `/donations/${encodeURIComponent(id)}/checkpoint`, {});
  },

  resetDemoData() {
    return request('POST', '/donations/reset-demo', {});
  },
};

// Makes apiService available to app.js/pages.js/donations.js (plain <script> tags, no imports needed)
window.apiService = apiService;
