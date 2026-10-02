const test = require('node:test');
const assert = require('node:assert/strict');

test('Vercel vacation mode refuses server-funded Gemini generation', () => {
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  const modulePath = require.resolve('../api/_byok-only');
  delete require.cache[modulePath];
  const { BYOK_ONLY_MODE, rejectUnlessByokPlan } = require('../api/_byok-only');

  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  assert.equal(BYOK_ONLY_MODE, true);
  assert.equal(rejectUnlessByokPlan({ headers: {} }, response), true);
  assert.equal(response.statusCode, 402);
  assert.equal(response.body.error, 'byok_required');

  const plannedResponse = { status() { throw new Error('BYOK plans must not be rejected'); } };
  assert.equal(rejectUnlessByokPlan({ headers: { 'x-rpgy-byok-plan': '1' } }, plannedResponse), false);

  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
  delete require.cache[modulePath];
});
