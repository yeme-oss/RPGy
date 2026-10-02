// Local dev server: serves the static site and runs the api/*.js routes, with no Vercel account.
// Usage: node server.js   (then open http://localhost:3000)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

try { process.loadEnvFile?.('.env'); } catch (_) { /* no .env file: fine, everything in it is optional */ }

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Gives a plain Node response the small Vercel-style API the routes use.
function decorate(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = value => {
    if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return res.json(value);
    res.end(value);
    return res;
  };
  return res;
}

async function runApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const file = path.join(ROOT, 'api', `${name}.js`);
  // Only real routes: no sub-folders, and files starting with "_" are helpers.
  if (!/^[a-z][a-z0-9-]*$/i.test(name) || !fs.existsSync(file)) {
    return decorate(res).status(404).json({ error: 'Unknown API route' });
  }
  req.query = Object.fromEntries(url.searchParams);
  const raw = await readBody(req);
  const type = String(req.headers['content-type'] || '');
  if (raw.length && type.includes('application/json')) {
    try { req.body = JSON.parse(raw.toString('utf8')); }
    catch (_) { return decorate(res).status(400).json({ error: 'Invalid JSON body' }); }
  } else {
    req.body = raw.length ? raw.toString('utf8') : {};
  }
  try {
    await require(file)(req, decorate(res));
  } catch (error) {
    console.error(`[${name}]`, error);
    if (!res.headersSent) decorate(res).status(500).json({ error: 'Server error' });
  }
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const blocked = /(^|[\\/])(\.|node_modules|api|tests|server\.js|package)/i.test(path.relative(ROOT, file));
  if (!file.startsWith(ROOT + path.sep) || blocked || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return void runApi(req, res, url);
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`RPGy running at http://localhost:${PORT}`);
  console.log('Click "UNLOCK WITH YOUR GEMINI API KEY" in the page and paste your key. No account needed.');
});
