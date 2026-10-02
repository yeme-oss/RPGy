// RPGy has no paywall, no serial keys and no action counter: every request is allowed.
// The only thing worth knowing about a request is whether the player brought their own
// Gemini key (BYOK), in which case Google bills that key directly and nothing here is spent.
// The exports keep their old names so the API routes read the same as before.
const { geminiKeyFromRequest } = require('./_byok');

const PLAYTEST_LIMIT = 10_000;

function publicConfig() {
  return { billingEnabled: false, checkoutUrl: '' };
}

function extractKey() {
  return '';
}

function open(req) {
  const byok = Boolean(geminiKeyFromRequest(req));
  return {
    allowed: true,
    reason: byok ? 'byok' : 'free',
    remaining: PLAYTEST_LIMIT,
    used: 0,
    limit: PLAYTEST_LIMIT,
    billingEnabled: false,
    byok,
    checkoutUrl: ''
  };
}

const consume = async req => open(req);
const peek = async req => open(req);
const peekLicense = async req => open(req);
const authorize = async req => open(req);
// Gifting turns on a share link no longer exists: there is nothing to reserve.
const reserveLicenseCredits = async () => ({ allowed: false, reason: 'billing_unavailable', remaining: 0, limit: 0, billingEnabled: false });

function reject(res, result = {}) {
  return res.status(402).json({
    error: result.reason || 'not_allowed',
    message: 'This request was refused.',
    actionsRemaining: 0,
    limit: 0,
    billingEnabled: false,
    checkoutUrl: ''
  });
}

module.exports = { consume, peek, peekLicense, reserveLicenseCredits, authorize, reject, extractKey, publicConfig, PLAYTEST_LIMIT };
