/**
 * recaptcha.js
 * ---------------------------------------------------------------
 * Optional Google reCAPTCHA Enterprise verification.
 *
 * Two deliberate changes from the earlier version, both of which were
 * breaking the app:
 *
 * 1. OFF BY DEFAULT. It used to read
 *      REQUIRE_RECAPTCHA !== 'false'   → enforced whenever unset
 *    while no page in the site ever sends a recaptchaToken, so
 *    `POST /auth/login` and `POST /donations/pledge` answered 400
 *    recaptcha_failed on a clean checkout: nobody could log in. Now
 *    it enforces only on an explicit REQUIRE_RECAPTCHA=true, and the
 *    frontend attaches a token when (and only when) a site key is
 *    configured.
 *
 * 2. LAZY REQUIRE. `@google-cloud/recaptcha-enterprise` was required
 *    at module load, so the entire API refused to boot if that
 *    optional package wasn't installed. It's now pulled in on first
 *    use, matching how appCheck.js guards firebase-admin.
 *
 * Turning it on:
 *   npm install @google-cloud/recaptcha-enterprise
 *   RECAPTCHA_PROJECT_ID=your-gcp-project
 *   RECAPTCHA_SITE_KEY=your-site-key          (public; also set on the frontend)
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   REQUIRE_RECAPTCHA=true
 * --------------------------------------------------------------- */

const REQUIRE_RECAPTCHA = process.env.REQUIRE_RECAPTCHA === 'true';
const PROJECT_ID = process.env.RECAPTCHA_PROJECT_ID || '';
const SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '';

let clientInstance = null;
let clientUnavailable = false;

function getClient() {
  if (clientInstance || clientUnavailable) return clientInstance;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
    clientInstance = new RecaptchaEnterpriseServiceClient();
  } catch (err) {
    clientUnavailable = true;
    console.warn('[recaptcha] REQUIRE_RECAPTCHA=true but the client could not load — verification is NOT enforced:', err.message);
  }
  return clientInstance;
}

async function verifyRecaptcha(token, expectedAction = 'LOGIN') {
  if (!REQUIRE_RECAPTCHA) return { ok: true, reason: 'verification_disabled' };
  if (!PROJECT_ID || !SITE_KEY) {
    console.warn('[recaptcha] enabled but RECAPTCHA_PROJECT_ID / RECAPTCHA_SITE_KEY are unset — allowing the request through.');
    return { ok: true, reason: 'not_configured' };
  }
  if (!token) return { ok: false, reason: 'missing_token' };

  const client = getClient();
  if (!client) return { ok: true, reason: 'client_unavailable' };

  try {
    const [response] = await client.createAssessment({
      parent: client.projectPath(PROJECT_ID),
      assessment: { event: { token, siteKey: SITE_KEY, expectedAction } },
    });

    if (!response.tokenProperties || !response.tokenProperties.valid) {
      return {
        ok: false,
        reason: 'invalid_token',
        invalidReason: response.tokenProperties && response.tokenProperties.invalidReason,
      };
    }
    if (response.tokenProperties.action !== expectedAction) {
      return { ok: false, reason: 'action_mismatch' };
    }
    return {
      ok: true,
      score: response.riskAnalysis && response.riskAnalysis.score,
      action: response.tokenProperties.action,
    };
  } catch (err) {
    console.error('[recaptcha] assessment failed:', err.message);
    // Fail closed in production, open in development: a misconfigured
    // dev machine shouldn't block the demo, but a live deployment
    // shouldn't silently stop checking either.
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'verification_unavailable' };
    }
    return { ok: true, reason: 'verification_skipped_dev' };
  }
}

/**
 * Express middleware factory. `action` should match the action name the
 * frontend used when it minted the token.
 */
function requireRecaptcha(action = 'LOGIN') {
  return function recaptchaMiddleware(req, res, next) {
    if (!REQUIRE_RECAPTCHA) return next();
    const token = req.body && req.body.recaptchaToken;
    verifyRecaptcha(token, action)
      .then((result) => {
        if (result.ok) return next();
        // The reason is logged, not returned: a bot shouldn't learn
        // exactly which check it failed.
        console.warn('[recaptcha] rejected a %s request:', action, result.reason);
        return res.status(400).json({ error: 'recaptcha_failed' });
      })
      .catch((err) => {
        console.error('[recaptcha] middleware error:', err.message);
        return res.status(503).json({ error: 'recaptcha_unavailable' });
      });
    return undefined;
  };
}

module.exports = { verifyRecaptcha, requireRecaptcha, REQUIRE_RECAPTCHA, SITE_KEY };
