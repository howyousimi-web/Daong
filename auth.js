/**
 * auth.js (Local persistent token store version)
 * ---------------------------------------------------------------
 * Demo role login (no real credential check). Tokens are stored
 * persistently in db.json so they survive server restarts.
 * For multi-instance deployments, migrate to Redis/Firestore.
 * --------------------------------------------------------------- */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEMO_USERS = {
  donor: { id: 'usr-100', name: 'Guest Volunteer', email: 'guest@example.com', role: 'donor' },
  admin: { id: 'usr-900', name: 'J. Santos', email: 'coordinator@daong.org.ph', role: 'admin' },
};

const TOKENS_FILE = path.join(__dirname, 'db.json');

function loadTokens() {
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data.tokens || {};
  } catch (_err) {
    return {};
  }
}

function saveTokens(tokens) {
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
    const data = JSON.parse(raw);
    data.tokens = tokens;
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
  } catch (_err) {
    // Ignore if file doesn't exist yet
  }
}

function issueToken(role) {
  const user = DEMO_USERS[role] || DEMO_USERS.donor;
  const token = `daong.${role}.${crypto.randomBytes(16).toString('hex')}`;
  
  const tokens = loadTokens();
  tokens[token] = { 
    ...user, 
    issuedAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hour expiry
  };
  saveTokens(tokens);
  
  return { token, user };
}

function verifyToken(token) {
  if (!token) return null;
  
  const tokens = loadTokens();
  const entry = tokens[token];
  
  if (!entry) return null;
  
  // Check if expired
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    delete tokens[token];
    saveTokens(tokens);
    return null;
  }
  
  // Remove internal fields before returning
  const { issuedAt, expiresAt, ...userData } = entry;
  return userData;
}

// Express middleware: attaches req.user if a valid Bearer token is
// present, else responds 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

module.exports = { DEMO_USERS, issueToken, verifyToken, requireAuth };
