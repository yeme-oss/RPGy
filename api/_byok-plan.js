function wantsByokPlan(req) {
  const value = req?.headers?.['x-rpgy-byok-plan'];
  return Array.isArray(value) ? value[0] === '1' : value === '1';
}

function sendTextPlan(res, messages, options = {}, meta = {}) {
  return res.status(200).json({
    byokPlan: {
      kind: 'text',
      messages,
      options: {
        json: options.json === true,
        maxOutputTokens: options.maxOutputTokens || null,
        thinkingLevel: options.thinkingLevel || 'low'
      },
      meta
    }
  });
}

module.exports = { wantsByokPlan, sendTextPlan };
