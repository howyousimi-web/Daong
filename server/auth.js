/**
 * auth.js
 * ---------------------------------------------------------------
 * Demo role login: no real credential check, matching the site's
 * one-click "Log In (Demo)" / "Log in as coordinator" buttons.
 * A login issues an opaque random token; write routes require it as
 * `Authorization: Bearer <token>`.
 *
 * Tokens are persisted to data/tokens.json — deliberately a DIFFERENT
 * file from store.js's db.json. Both modules previously wrote db.json
 * from their own in-memory copy, so the first donation a coordinator
 * registered wiped every issued token and logged them straight back
 * out. Separate files, separate owners, no clobbering.
 *
 * Not a real identity system: swap issueToken/verifyToken for proper
 * sessions or signed JWTs plus a user table before this handles real
 * accounts.
 * --------------------------------------------------------------- */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEMO_USERS = {
  donor: { id: 'usr-100', name: 'Guest Volunteer', email: 'guest@example.com', role: 'donor' },
  admin: { id: 'usr-900', name: 'J. Santos', email: 'coordinator@daong.org.ph', role: 'admin' },
};

const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 24) * 60 * 60 * 1000;

const DATA_DIR = process.env.DAONG_DATA_DIR
  ? path.resolve(process.env.DAONG_DATA_DIR)
  : path.join(__dirname, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

function loadTokens() {
  try {
    const parsed = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function saveTokens(tokens) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${TOKENS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2));
    fs.renameSync(tmp, TOKENS_FILE);
  } catch (err) {
    console.error('[auth] could not persist tokens:', err.message);
  }
}

// Drops expired entries so the file doesn't grow forever.
function sweep(tokens) {
  const now = Date.now();
  let changed = false;
  Object.keys(tokens).forEach((t) => {
    if (!tokens[t] || !tokens[t].expiresAt || tokens[t].expiresAt < now) {
      delete tokens[t];
      changed = true;
    }
  });
  return changed;
}

/* =========================================================
   PLUGGABLE PERSISTENCE
   The default backend is the JSON file above. Cloud Functions has no
   durable local disk, so functions/index.js swaps in a Firestore
   backend via configure(). Every consumer below treats the result as
   a promise, which makes both backends interchangeable.
   ========================================================= */
let backend = {
  load: () => loadTokens(),
  save: (tokens) => saveTokens(tokens),
};

function configure(customBackend) {
  backend = customBackend;
}

async function issueToken(role) {
  const key = role === 'admin' ? 'admin' : 'donor';
  const user = DEMO_USERS[key];
  const token = `daong.${key}.${crypto.randomBytes(24).toString('hex')}`;

  const tokens = (await backend.load()) || {};
  sweep(tokens);
  tokens[token] = { ...user, issuedAt: Date.now(), expiresAt: Date.now() + TOKEN_TTL_MS };
  await backend.save(tokens);

  return { token, user };
}

async function revokeToken(token) {
  if (!token) return false;
  const tokens = (await backend.load()) || {};
  if (!tokens[token]) return false;
  delete tokens[token];
  await backend.save(tokens);
  return true;
}

async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const tokens = (await backend.load()) || {};
  const entry = tokens[token];
  if (!entry) return null;

  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    delete tokens[token];
    await backend.save(tokens);
    return null;
  }

  const { issuedAt, expiresAt, ...user } = entry;
  return user;
}

function bearerFrom(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// Middleware wraps async verification and forwards any thrown error to
// the error handler rather than leaving the request hanging.
function guard(check) {
  return function middleware(req, res, next) {
    verifyToken(bearerFrom(req))
      .then((user) => check(user, req, res, next))
      .catch(next);
  };
}

/** Hard gate: 401 unless a valid token is present. */
const requireAuth = guard((user, req, res, next) => {
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  req.token = bearerFrom(req);
  return next();
});

/** Hard gate: a valid token AND the coordinator role. */
const requireAdmin = guard((user, req, res, next) => {
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'admin_only' });
  req.user = user;
  req.token = bearerFrom(req);
  return next();
});

/**
 * Soft gate: attaches req.user when a valid token is present and carries
 * on regardless. Used by public routes whose *response* varies by role —
 * the assistant, and the donations list (coordinators see donor names
 * and flag detail, the public doesn't).
 */
const optionalAuth = guard((user, req, _res, next) => {
  if (user) {
    req.user = user;
    req.token = bearerFrom(req);
  }
  return next();
});

module.exports = {
  DEMO_USERS,
  configure,
  issueToken,
  verifyToken,
  revokeToken,
  requireAuth,
  requireAdmin,
  optionalAuth,
  TOKENS_FILE,
};
