const test = require('node:test');
const assert = require('node:assert/strict');

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  };
}

test('share links create immutable permanent snapshots', async () => {
  const redisModulePath = require.resolve('@upstash/redis');
  const originalRedisExports = require(redisModulePath);
  const store = new Map();
  class FakeRedis {
    async set(key, value, options = {}) {
      if (options.nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }
    async get(key) { return store.has(key) ? store.get(key) : null; }
  }

  require.cache[redisModulePath].exports = { ...originalRedisExports, Redis: FakeRedis };
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const sharePath = require.resolve('../api/_share');
  delete require.cache[sharePath];
  const { handleShare: share } = require('../api/_share');

  const save = {
    gameState: { player: { name: 'Mara', hp: 73 }, currentLocation: 'Drowned Archive' },
    storySoFar: 'The tide has entered the lower stacks.'
  };
  const created = responseHarness();
  await share({ method: 'POST', body: { save }, headers: {} }, created);
  assert.equal(created.statusCode, 201);
  assert.match(created.body.id, /^[A-Za-z0-9_-]{20,40}$/);
  assert.equal(created.body.immutable, true);

  const loaded = responseHarness();
  await share({ method: 'GET', query: { id: created.body.id }, headers: {} }, loaded);
  assert.equal(loaded.statusCode, 200);
  assert.deepEqual(loaded.body.save, save);
  assert.match(loaded.headers['cache-control'], /immutable/);

  const second = responseHarness();
  await share({ method: 'POST', body: { save: { ...save, storySoFar: 'A later state.' } }, headers: {} }, second);
  assert.equal(second.statusCode, 201);
  assert.notEqual(second.body.id, created.body.id);

  const originalAgain = responseHarness();
  await share({ method: 'GET', query: { id: created.body.id }, headers: {} }, originalAgain);
  assert.equal(originalAgain.body.save.storySoFar, save.storySoFar);

  require.cache[redisModulePath].exports = originalRedisExports;
  delete require.cache[sharePath];
});
