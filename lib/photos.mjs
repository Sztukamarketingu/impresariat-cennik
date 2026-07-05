// Proxy zdjęć: /api/photo/:recId -> Google Drive (thumbnail/uc) z cache dyskowym.
// Drive fileId resolwowany serwerowo z danych Airtable — użytkownik nigdy nie podaje Drive ID.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPhotoDriveId } from './airtable.mjs';

const CACHE_DIR = process.env.PHOTO_CACHE_DIR || join(process.cwd(), 'photo-cache');
mkdirSync(CACHE_DIR, { recursive: true });

export const REC_ID_RE = /^rec[A-Za-z0-9]{14,17}$/;

const MIME_BY_SIG = [
  ['ffd8', 'image/jpeg'],
  ['89504e47', 'image/png'],
  ['52494646', 'image/webp'],
];

function sniffMime(buf) {
  const sig = buf.subarray(0, 4).toString('hex');
  for (const [prefix, mime] of MIME_BY_SIG) if (sig.startsWith(prefix)) return mime;
  return null;
}

async function fetchDrive(fileId) {
  const urls = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = sniffMime(buf);
      if (mime && buf.length > 500) return { buf, mime }; // HTML (strona logowania Drive) odpada na sniffie
    } catch { /* spróbuj kolejny URL */ }
  }
  return null;
}

// Zwraca { buf, mime, maxAge } albo null (=> serwuj placeholder)
export async function getPhoto(recId) {
  if (!REC_ID_RE.test(recId)) return null;
  const cached = join(CACHE_DIR, `${recId}.jpg`);
  const meta = join(CACHE_DIR, `${recId}.meta`);
  if (existsSync(cached)) {
    const mime = existsSync(meta) ? readFileSync(meta, 'utf8').trim() : 'image/jpeg';
    return { buf: readFileSync(cached), mime, maxAge: 86400 };
  }
  const fileId = await getPhotoDriveId(recId);
  if (!fileId) return null;
  const got = await fetchDrive(fileId);
  if (!got) { console.error('[photo] Drive nie oddał obrazu dla', recId); return null; }
  try {
    writeFileSync(cached, got.buf);
    writeFileSync(meta, got.mime);
  } catch (e) { console.error('[photo] zapis cache FAIL:', e.message); }
  return { buf: got.buf, mime: got.mime, maxAge: 86400 };
}
