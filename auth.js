/**
 * auth.js
 * ---------------------------------------------------------------
 * The frontend's login is explicitly a "labeled demo login" (see
 * AuthStateManager.login() in app.js) — one click picks a role,
 * there's no real credential check. This module mirrors that: it
 * issues a signed-looking opaque token for a role and verifies it
 * on write routes, without pretending to be a real identity system.
 *
 * Swap this for real auth (Firebase Auth, a proper JWT + user table,
 * etc.) by replacing issueToken()/verifyToken() — every route below
 * only depends on those two functions and the {id, name, email, role}
 * user shape, so nothing else needs to change.
 * --------------------------------------------------------------- */
const crypto = require('crypto');

const DEMO_USERS = {
  donor: { id: 'usr-100', name: 'Guest Volunteer', email: 'guest@example.com', role: 'donor' },
  admin: { id: 'usr-900', name: 'J. Santos', email: 'coordinator@daong.org.ph', role: 'admin' },
};

// In-memory token → user map. Tokens don't survive a server restart,
// which just means everyone's session-logged-out on redeploy — fine
// for a hackathon demo, and a real JWT would want the same "expire on
// key rotation" behavior anyway.
const activeTokens = new Map();

function issueToken(role) {
  const user = DEMO_USERS[role] || DEMO_USERS.donor;
  const token = `daong.${role}.${crypto.randomBytes(16).toString('hex')}`;
  activeTokens.set(token, user);
  return { token, user };
}

function verifyToken(token) {
  if (!token) return null;
  return activeTokens.get(token) || null;
}

// Express middleware: attaches req.user if a valid Bearer token is
// present, else responds 401. Use on any route that mutates data.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  next();
}

module.exports = { DEMO_USERS, issueToken, verifyToken, requireAuth };
