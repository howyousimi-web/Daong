/**
 * appCheck.js
 * ---------------------------------------------------------------
 * Firebase App Check: attests that a request came from the real
 * frontend (running reCAPTCHA v3 under the hood), not a script
 * hitting the API directly. This is the "Firebase for security"
 * layer — separate from and complementary to the visible reCAPTCHA
 * v2 checkbox on the pledge form (recaptcha.js), which stops casual
 * bots at the form; App Check stops scripted abuse of the API itself.
 *
 * Guarded like every other optional integration in this project:
 * if Firebase isn't configured, `requireAppCheck` is a no-op that
 * lets every request through, so a missing Firebase project can
 * never take down the API. Flip it on by:
 *
 *   1. `npm install firebase-admin`
 *   2. Create a Firebase project, enable App Check, register a Web
 *      app with the reCAPTCHA v3 provider.
 *   3. Download a service account key, set
 *      GOOGLE_APPLICATION_CREDENTIALS to its path (or set
 *      FIREBASE_SERVICE_ACCOUNT_JSON to the key's JSON as a string).
 *   4. Set ENABLE_APP_CHECK=true.
 *   5. Have the frontend attach the App Check token it gets from the
 *      Firebase JS SDK as an `X-Firebase-AppCheck` header on API calls.
 * --------------------------------------------------------------- */
const ENABLED = process.env.ENABLE_APP_CHECK === 'true';

let appCheckInstance = null;

function tryInitFirebase() {
  if (!ENABLED || appCheckInstance) return appCheckInstance;
  try {
    // Lazy require so a project that never enables App Check doesn't
    // need `firebase-admin` installed at all.
    // eslint-disable-next-line global-require, import/no-unresolved
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      admin.initializeApp({
        credential: serviceAccountJson
          ? admin.credential.cert(JSON.parse(serviceAccountJson))
          : admin.credential.applicationDefault(),
      });
    }
    appCheckInstance = admin.appCheck();
  } catch (err) {
    console.warn('[appCheck] ENABLE_APP_CHECK=true but Firebase Admin could not initialize — App Check is NOT enforced:', err.message);
    appCheckInstance = null;
  }
  return appCheckInstance;
}

// Express middleware. No-ops (calls next()) unless ENABLE_APP_CHECK=true
// AND Firebase Admin initialized successfully — see the guard notes above.
function requireAppCheck(req, res, next) {
  if (!ENABLED) return next();
  const appCheck = tryInitFirebase();
  if (!appCheck) return next(); // misconfigured — fail open, don't break the demo

  const token = req.header('X-Firebase-AppCheck');
  if (!token) return res.status(401).json({ error: 'app_check_token_missing' });

  appCheck.verifyToken(token)
    .then(() => next())
    .catch(() => res.status(401).json({ error: 'app_check_token_invalid' }));
}

module.exports = { requireAppCheck };
