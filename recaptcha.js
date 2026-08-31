/**
 * recaptcha.js
 * ---------------------------------------------------------------
 * Server-side verification for the reCAPTCHA v2 checkbox shown on
 * the frontend's pledge/donation forms. A token solved in the
 * browser is meaningless on its own — anyone can skip the widget
 * and call the API directly — so this module re-checks that token
 * against Google's siteverify endpoint before a pledge/donation is
 * accepted.
 *
 * Ships with Google's published TEST secret key, paired with the
 * TEST site key already wired into the frontend — that pair always
 * verifies successfully, so pledges work out of the box with zero
 * setup. Swap RECAPTCHA_SECRET_KEY (env var) for your own secret key
 * from https://www.google.com/recaptcha/admin before this goes
 * anywhere real; the test pair accepts everyone, bots included.
 * --------------------------------------------------------------- */
const TEST_SECRET_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';
const SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || TEST_SECRET_KEY;

async function verifyRecaptcha(token) {
  if (!token) return { ok: false, reason: 'missing_token' };
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: SECRET_KEY, response: token }),
    });
    const data = await res.json();
    return data.success ? { ok: true } : { ok: false, reason: 'failed_verification', errors: data['error-codes'] };
  } catch (err) {
    // Google unreachable — fail closed on writes that matter, but don't
    // let a flaky network call take down the whole demo; the caller
    // decides what "ok: false" means for that route.
    return { ok: false, reason: 'verification_unavailable', message: String(err) };
  }
}

// Express middleware: expects `recaptchaToken` in the JSON body. Skips
// enforcement entirely if REQUIRE_RECAPTCHA=false (handy for automated
// testing / curl-ing the API directly during development).
function requireRecaptcha(req, res, next) {
  if (process.env.REQUIRE_RECAPTCHA === 'false') return next();
  const token = req.body && req.body.recaptchaToken;
  verifyRecaptcha(token).then((result) => {
    if (result.ok) return next();
    res.status(400).json({ error: 'recaptcha_failed', ...result });
  });
}

module.exports = { verifyRecaptcha, requireRecaptcha };
