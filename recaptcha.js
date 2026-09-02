/**
 * recaptcha.js
 * ---------------------------------------------------------------
 * Google reCAPTCHA Enterprise verification using the official
 * Node.js client pattern exactly like the sample you provided.
 *
 * If REQUIRE_RECAPTCHA=false or credentials are missing in dev,
 * verification becomes a no-op. Before deploying to production,
 * ensure GOOGLE_APPLICATION_CREDENTIALS or RECAPTCHA_PROJECT_ID
 * environment variables are properly set.
 * --------------------------------------------------------------- */
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');

const PROJECT_ID = process.env.RECAPTCHA_PROJECT_ID || 'daong-tanaw';
const SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '6Le1OKMtAAAAAPbnCUTU2dc1wRf4Qt3Hpb8wjCvS';
const REQUIRE_RECAPTCHA = process.env.REQUIRE_RECAPTCHA !== 'false';

let clientInstance = null;

function getClient() {
  if (!clientInstance) {
    clientInstance = new RecaptchaEnterpriseServiceClient();
  }
  return clientInstance;
}

async function verifyRecaptcha(token, expectedAction = 'LOGIN') {
  // In dev mode or if disabled, skip verification
  if (!REQUIRE_RECAPTCHA) {
    return { ok: true, reason: 'verification_disabled', action: expectedAction };
  }

  if (!token) return { ok: false, reason: 'missing_token' };

  try {
    const client = getClient();
    const projectPath = client.projectPath(PROJECT_ID);

    const request = {
      assessment: {
        event: {
          token,
          siteKey: SITE_KEY,
        },
      },
      parent: projectPath,
    };

    const [response] = await client.createAssessment(request);

    if (!response.tokenProperties.valid) {
      return {
        ok: false,
        reason: 'invalid_token',
        invalidReason: response.tokenProperties.invalidReason,
      };
    }

    if (response.tokenProperties.action !== expectedAction) {
      return {
        ok: false,
        reason: 'action_mismatch',
        expectedAction,
        actualAction: response.tokenProperties.action,
      };
    }

    return {
      ok: true,
      score: response.riskAnalysis && response.riskAnalysis.score,
      reasons: response.riskAnalysis && response.riskAnalysis.reasons,
      action: response.tokenProperties.action,
    };
  } catch (err) {
    // If credentials are missing/invalid in development, log a warning
    // but don't block the request. In production, this should fail.
    const isDevError = err.message.includes('GOOGLE_APPLICATION_CREDENTIALS') || 
                       err.message.includes('not authorized');
    if (isDevError && process.env.NODE_ENV !== 'production') {
      console.warn('[recaptcha] Credentials missing (dev mode):', err.message);
      return { ok: true, reason: 'verification_skipped_dev', action: expectedAction };
    }
    return {
      ok: false,
      reason: 'verification_unavailable',
      message: String(err),
    };
  }
}

function requireRecaptcha(req, res, next) {
  if (!REQUIRE_RECAPTCHA) return next();
  const token = req.body && req.body.recaptchaToken;
  verifyRecaptcha(token, 'LOGIN').then((result) => {
    if (result.ok) return next();
    res.status(400).json({ error: 'recaptcha_failed', ...result });
  }).catch((err) => {
    res.status(500).json({ error: 'recaptcha_error', message: String(err) });
  });
}

module.exports = { verifyRecaptcha, requireRecaptcha };
