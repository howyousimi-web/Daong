/**
 * auth.js (Cloud Functions version)
 * ---------------------------------------------------------------
 * Same "demo role, not real credentials" login as ../server/auth.js,
 * but tokens live in Firestore instead of an in-memory Map. A Cloud
 * Function can (and will) run as multiple concurrent instances with
 * separate memory — a token issued by one instance needs to verify
 * successfully on a request handled by a different instance, which
 * only works if it's looked up somewhere all instances share.
 * --------------------------------------------------------------- */
const crypto = require('crypto');
const admin = require('firebase-admin');

const DEMO_USERS = {
  donor: { id: 'usr-100', name: 'Guest Volunteer', email: 'guest@example.com', role: 'donor' },
  admin: { id: 'usr-900', name: 'J. Santos', email: 'coordinator@daong.org.ph', role: 'admin' },
};

function db() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

async function issueToken(role) {
  const user = DEMO_USERS[role] || DEMO_USERS.donor;
  const token = `daong.${role}.${crypto.randomBytes(16).toString('hex')}`;
  await db().collection('tokens').doc(token).set({ ...user, issuedAt: Date.now() });
  return { token, user };
}

async function verifyToken(token) {
  if (!token) return null;
  const doc = await db().collection('tokens').doc(token).get();
  return doc.exists ? doc.data() : null;
}

// Express middleware: attaches req.user if a valid Bearer token is
// present, else responds 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  verifyToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'unauthorized' }));
}

module.exports = { DEMO_USERS, issueToken, verifyToken, requireAuth };
