// Vercel sets VERCEL=1 for production functions. RPGY_BYOK_ONLY can force the
// same protection in another host without introducing a request-level bypass.
const BYOK_ONLY_MODE = String(process.env.RPGY_BYOK_ONLY || process.env.VERCEL || '').toLowerCase() === 'true'
  || String(process.env.RPGY_BYOK_ONLY || process.env.VERCEL || '') === '1';

function isByokPlan(req) {
  const value = req?.headers?.['x-rpgy-byok-plan'];
  return Array.isArray(value) ? value[0] === '1' : value === '1';
}

function rejectUnlessByokPlan(req, res) {
  if (!BYOK_ONLY_MODE || isByokPlan(req)) return false;
  res.status(402).json({
    error: 'byok_required',
    message: 'This action requires your own Gemini API Key.',
    byokOnly: true,
    billingEnabled: false,
    actionsRemaining: 0
  });
  return true;
}

module.exports = { BYOK_ONLY_MODE, rejectUnlessByokPlan };
