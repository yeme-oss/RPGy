const crypto = require('node:crypto');
const { Redis } = require('@upstash/redis');

const SHARE_PREFIX = 'rpgy:share:v1:';
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{20,40}$/;
const MAX_SAVE_BYTES = 4_000_000;

// Share links need a small key-value store (Upstash Redis, REST). Without one, the
// rest of RPGy works as usual and sharing answers 503.
let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (error) {
  console.error('share: Redis initialization failed:', error);
}

function noStore(res) {
  res.setHeader?.('Cache-Control', 'no-store, private, max-age=0');
}

async function handleShare(req, res) {
  if (!redis) {
    noStore(res);
    return res.status(503).json({ error: 'Share storage is not configured.' });
  }

  if (req.method === 'GET') {
    const id = String(req.query?.id || '').trim();
    if (!SHARE_ID_PATTERN.test(id)) {
      noStore(res);
      return res.status(400).json({ error: 'Invalid share link.' });
    }
    try {
      const stored = await redis.get(`${SHARE_PREFIX}${id}`);
      if (!stored) {
        noStore(res);
        return res.status(404).json({ error: 'Shared game not found.' });
      }
      const envelope = typeof stored === 'string' ? JSON.parse(stored) : stored;
      res.setHeader?.('Cache-Control', 'public, max-age=300, s-maxage=86400, immutable');
      return res.status(200).json(envelope);
    } catch (error) {
      console.error('share: read failed:', error);
      noStore(res);
      return res.status(500).json({ error: 'Could not load this shared game.' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const save = req.body?.save;
  if (!save || typeof save !== 'object' || !save.gameState || typeof save.gameState !== 'object') {
    noStore(res);
    return res.status(400).json({ error: 'A valid RPGy save is required.' });
  }
  const snapshot = {
    gameState: save.gameState,
    storySoFar: typeof save.storySoFar === 'string' ? save.storySoFar : ''
  };
  const envelope = {
    version: 1,
    createdAt: new Date().toISOString(),
    save: snapshot
  };
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SAVE_BYTES) {
    noStore(res);
    return res.status(413).json({ error: 'This save is too large to share. Save locally and remove oversized generated media first.' });
  }

  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = crypto.randomBytes(18).toString('base64url');
      const stored = await redis.set(`${SHARE_PREFIX}${id}`, serialized, { nx: true });
      if (stored) {
        noStore(res);
        return res.status(201).json({ id, createdAt: envelope.createdAt, immutable: true });
      }
    }
    throw new Error('Could not allocate a unique share ID');
  } catch (error) {
    console.error('share: write failed:', error);
    noStore(res);
    return res.status(500).json({ error: 'Could not create the share link.' });
  }
}

module.exports = { handleShare };
