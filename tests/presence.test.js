const test = require('node:test');
const assert = require('node:assert/strict');
const { validSessionId, PRESENCE_WINDOW_MS } = require('../api/_presence');

test('presence accepts anonymous UUID-like sessions without storing personal data', () => {
  assert.equal(validSessionId('49c1665f-1fd8-4f17-8fb8-b85a4fb7f505'), '49c1665f-1fd8-4f17-8fb8-b85a4fb7f505');
  assert.equal(validSessionId('short'), '');
  assert.equal(validSessionId('session with spaces'), '');
  assert.equal(PRESENCE_WINDOW_MS, 120000);
});
