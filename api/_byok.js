function geminiKeyFromRequest(req) {
  const raw = req?.headers?.['x-rpgy-gemini-key'];
  const key = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
  // Keep this deliberately permissive for Google key formats, but reject junk
  // before it reaches a provider. The value is never logged or persisted.
  return key.length >= 20 && key.length <= 512 ? key : '';
}

module.exports = { geminiKeyFromRequest };
