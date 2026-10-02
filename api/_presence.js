const { Redis } = require('@upstash/redis');

const PRESENCE_KEY = 'rpgy:presence:playing:v1';
const PRESENCE_WINDOW_MS = 120000;

function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function validSessionId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{12,128}$/.test(id) ? id : '';
}

async function pruneAndCount(redis, now) {
  await redis.zremrangebyscore(PRESENCE_KEY, 0, now - PRESENCE_WINDOW_MS);
  const count = Number(await redis.zcard(PRESENCE_KEY)) || 0;
  await redis.expire(PRESENCE_KEY, Math.ceil(PRESENCE_WINDOW_MS / 1000) * 3);
  return count;
}

async function handlePresence(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const redis = createRedis();
  if (!redis) return res.status(200).json({ count: 0, available: false });

  try {
    const now = Date.now();
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const sessionId = validSessionId(body.sessionId);
      if (!sessionId) return res.status(400).json({ error: 'invalid_session' });
      if (body.active === false) await redis.zrem(PRESENCE_KEY, sessionId);
      else await redis.zadd(PRESENCE_KEY, { score: now, member: sessionId });
    }
    return res.status(200).json({ count: await pruneAndCount(redis, now), available: true });
  } catch (error) {
    console.error('presence: Redis operation failed:', error.message);
    return res.status(200).json({ count: 0, available: false });
  }
}

module.exports = { handlePresence, PRESENCE_WINDOW_MS, validSessionId };
