// Generator zapytań — serwer HTTP (statyka + API), zero zależności npm.
// Uruchomienie: node server.mjs  (env: PORT, AIRTABLE_API_KEY, N8N_INQUIRY_WEBHOOK_URL, ...)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { getCatalog, getBusyIds } from './lib/airtable.mjs';
import { getPhoto, REC_ID_RE } from './lib/photos.mjs';
import { handleInquiry, handleLead } from './lib/inquiry.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(DIR, 'public');
const PORT = parseInt(process.env.PORT || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  // GA4 (gtag.js): skrypt z googletagmanager.com, beacony do google-analytics.com;
  // frame-src: osadzone odtwarzacze YouTube w podglądzie artysty
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://www.googletagmanager.com 'sha256-OhCII+Mr7P6ThF3cyyHciMdO0I8XtsO3louTDyAK/L4='; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const PLACEHOLDER_SVG = readFileSync(join(PUBLIC, 'placeholder.svg'));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (path === '/api/artists' && req.method === 'GET') {
      const catalog = await getCatalog();
      return sendJson(res, 200, catalog);
    }

    // zajęci wykonawcy w danym dniu (tylko ID — bez powodu/szczegółów)
    if (path === '/api/busy' && req.method === 'GET') {
      const date = url.searchParams.get('date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'bad date' });
      return sendJson(res, 200, { busy: await getBusyIds(date) });
    }

    if (path.startsWith('/api/photo/') && req.method === 'GET') {
      const recId = path.slice('/api/photo/'.length);
      if (!REC_ID_RE.test(recId)) return sendJson(res, 400, { error: 'bad id' });
      const photo = await getPhoto(recId);
      if (photo) return send(res, 200, photo.buf, { 'Content-Type': photo.mime, 'Cache-Control': `public, max-age=${photo.maxAge}` });
      return send(res, 200, PLACEHOLDER_SVG, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    }

    if (path === '/api/lead' && req.method === 'POST') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { ok: false }); }
      const { status, body } = await handleLead(payload, { ip: clientIp(req) });
      return sendJson(res, status, body);
    }

    if (path === '/api/inquiry' && req.method === 'POST') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { ok: false, error: 'Nieprawidłowe dane.' }); }
      const { status, body } = await handleInquiry(payload, { ip: clientIp(req), userAgent: req.headers['user-agent'] || '' });
      return sendJson(res, status, body);
    }

    if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });

    // statyka z public/ (bez path traversal)
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
    const rel = path === '/' ? 'index.html' : normalize(path).replace(/^([/\\]|\.\.)+/, '');
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
      // SPA: nieznane ścieżki -> index.html
      return send(res, 200, readFileSync(join(PUBLIC, 'index.html')), { 'Content-Type': MIME['.html'] });
    }
    const ext = file.slice(file.lastIndexOf('.'));
    return send(res, 200, readFileSync(file), {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // html/js/css bez cache (deploy nowej wersji ma działać od razu); obrazy 1h
      'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
    });
  } catch (e) {
    console.error('[server] błąd:', e.message);
    return sendJson(res, 500, { error: 'Błąd serwera. Spróbuj ponownie.' });
  }
});

server.listen(PORT, () => {
  const mock = !process.env.AIRTABLE_API_KEY || process.env.MOCK_DATA === '1';
  console.log(`Generator zapytań: http://localhost:${PORT} ${mock ? '[TRYB MOCK — dane testowe]' : '[Airtable LIVE]'}${process.env.N8N_INQUIRY_WEBHOOK_URL ? '' : ' [zapytania: tylko log]'}`);
});
