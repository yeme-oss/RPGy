// Reports whether the request carries a Gemini key (RPGy has no balance or paywall).
const { peek, peekLicense, publicConfig } = require('./_credits');

module.exports = async (req, res) => {
  // This response is serial-specific. Never let a browser, CDN, or service
  // worker reuse another key's balance for the same GET URL.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Vary', 'X-RPGY-License-Key, X-RPGY-Share-ID');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const result = req.query?.license_only === '1' ? await peekLicense(req) : await peek(req);
  res.status(200).json({
    actionsRemaining: result.remaining || 0,
    limit: result.limit || 0,
    billingEnabled: result.billingEnabled,
    licenseStatus: result.reason,
    licenseValid: result.allowed,
    creditSource: result.shareGrant ? 'share' : (result.byok ? 'byok' : 'license'),
    sharedCredits: result.shareGrant === true,
    checkoutUrl: publicConfig().checkoutUrl
  });
};
