// Warstwa danych: Airtable "Cennik 2026" -> publiczny katalog artystów.
// Tryb mock: brak AIRTABLE_API_KEY lub MOCK_DATA=1 -> data/mock-artists.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const AK = process.env.AIRTABLE_API_KEY || '';
const BASE = process.env.AIRTABLE_BASE_ID || 'app5NIUbshNL31ylr';
const TABLE = process.env.AIRTABLE_TABLE || 'Cennik 2026';
const TTL = parseInt(process.env.CACHE_TTL_MS || '600000', 10);
const MOCK = !AK || process.env.MOCK_DATA === '1';

export const EVENT_TYPES = [
  'Impreza plenerowa',
  'Impreza firmowa',
  'Impreza okolicznościowa',
  'Wydarzenie kulturalne',
  'Koncert tematyczny',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "13 000,00 zł" -> 13000 (wzorzec z generator-ofert/offer-from-deal.mjs)
export function parsePrice(s) {
  if (s === 0 || s) {
    if (typeof s === 'number') return Math.round(s);
    const d = String(s).replace(/[ \s]/g, '').replace(/zł/ig, '').replace(/,\d{2}$/, '').replace(/,/g, '.');
    const n = parseFloat(d);
    if (!isNaN(n)) return Math.round(n);
  }
  return null;
}

const fmtPln = (n) => n.toLocaleString('pl-PL').replace(/,/g, ' ');

// Zakres cenowy dla organizatora: Cena od/do -> etykieta; fallback kubełek z Cena nasza.
function priceRange(f) {
  const from = parsePrice(f['Cena od']);
  const to = parsePrice(f['Cena do']);
  if (from && to) return { from, to, label: `${fmtPln(from)} – ${fmtPln(to)} zł` };
  if (from) return { from, to: null, label: `od ${fmtPln(from)} zł` };
  const cena = parsePrice(f['Cena nasza']);
  if (cena) {
    const buckets = [10000, 20000, 30000, 40000, 50000];
    const ceil = buckets.find((b) => cena <= b);
    if (!ceil) return { from: 50000, to: null, label: 'powyżej 50 tys. zł' };
    const floor = buckets[buckets.indexOf(ceil) - 1] || 0;
    return { from: floor, to: ceil, label: floor ? `${floor / 1000}–${ceil / 1000} tys. zł` : `do ${ceil / 1000} tys. zł` };
  }
  return { from: null, to: null, label: 'wycena indywidualna' };
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

// Link "więcej" tylko gdy to konkretna podstrona wykonawcy — sama strona główna
// (brak ścieżki) nic nie wnosi, więc nie pokazujemy linku w ogóle.
function artistPageUrl(v) {
  const s = String(v || '').trim();
  if (!/^https?:\/\//.test(s)) return null;
  try {
    const u = new URL(s);
    return u.pathname && u.pathname !== '/' ? s : null;
  } catch { return null; }
}
const drivePhotoId = (ref) => { const m = String(ref || '').match(/[-\w]{25,}/); return m ? m[0] : null; };

// Rekord Airtable -> publiczny obiekt artysty. Whitelist pól — dokładne ceny,
// rozliczenia, maile/telefony managerów i ridery NIGDY nie wychodzą.
function toPublic(rec) {
  const f = rec.fields || {};
  const longDesc = String(f['Opis artysty'] || '').trim();
  const shortDesc = String(f['Opis krótki'] || '').trim()
    || (longDesc.length > 200 ? longDesc.slice(0, 197).replace(/\s+\S*$/, '') + '…' : longDesc);
  const youtube = [f['YouTube 1'], f['YouTube 2']]
    .map((u) => String(u || '').trim())
    .filter((u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u));
  return {
    id: rec.id,
    name: String(f['Wykonawca'] || '').trim(),
    shortDescription: shortDesc,
    description: longDesc,
    styles: asArray(f['Styl']).map((s) => String(s).trim()).filter(Boolean),
    programs: asArray(f['Programy']).map((s) => String(s).trim()).filter(Boolean),
    eventTypes: asArray(f['Typ wydarzenia']).filter((t) => EVENT_TYPES.includes(t)),
    priceRange: priceRange(f),
    hasPhoto: !!drivePhotoId(f['Zdjęcie główne']),
    photoUrl: `/api/photo/${rec.id}`,
    pageUrl: artistPageUrl(f['Impresariat strona']),
    youtube,
    priority: typeof f['Priorytet'] === 'number' ? f['Priorytet'] : 0,
  };
}

// Bogactwo rekordu — do deduplikacji po nazwie (wzorzec z generator-ofert)
function richness(f) {
  let s = 0;
  for (const k of ['Opis artysty', 'Zdjęcie główne', 'Cena od', 'Cena nasza', 'Styl', 'Impresariat strona', 'YouTube 1']) {
    if (f[k]) s++;
  }
  return s;
}

async function fetchAll() {
  const records = [];
  let offset = '';
  do {
    // katalog = CAŁY Cennik (decyzja Tomka 2026-07-05: bez pola "Widoczność w aplikacji")
    const u = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`
      + `?pageSize=100`
      + (offset ? `&offset=${offset}` : '');
    let j = null;
    for (let i = 0; i < 4; i++) {
      const r = await fetch(u, { headers: { Authorization: `Bearer ${AK}` } });
      if (r.status === 429) { await sleep(700); continue; }
      j = await r.json();
      if (Array.isArray(j.records)) break;
      j = null;
      await sleep(400);
    }
    if (!j) throw new Error('Airtable: brak odpowiedzi po retry');
    records.push(...j.records);
    offset = j.offset || '';
  } while (offset);

  // dedup po nazwie: zostaje najbogatszy rekord
  const byName = new Map();
  for (const rec of records) {
    const key = String(rec.fields?.['Wykonawca'] || '').trim().toLowerCase();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || richness(rec.fields) > richness(prev.fields)) byName.set(key, rec);
  }

  const artists = [...byName.values()].map(toPublic).filter((a) => a.name);
  // Drive fileId per rekord — używane przez /api/photo, nie wychodzi do frontu
  const photoIds = new Map();
  for (const rec of byName.values()) {
    const id = drivePhotoId(rec.fields?.['Zdjęcie główne']);
    if (id) photoIds.set(rec.id, id);
  }
  return { artists, photoIds };
}

function loadMock() {
  const file = process.env.MOCK_FILE || join(DIR, '..', 'data', 'mock-artists.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return { artists: raw.artists, photoIds: new Map() };
}

let cache = null; // { artists, photoIds, fetchedAt }
let refreshing = null;

async function refresh() {
  const data = MOCK ? loadMock() : await fetchAll();
  cache = { ...data, fetchedAt: new Date().toISOString() };
  return cache;
}

// Cache TTL + stale-while-revalidate; przy błędzie serwuj ostatni dobry stan.
export async function getCatalog() {
  if (!cache) {
    try { await refresh(); } catch (e) { console.error('[airtable] pierwszy fetch FAIL:', e.message); throw e; }
  } else if (Date.now() - Date.parse(cache.fetchedAt) > TTL && !refreshing) {
    refreshing = refresh().catch((e) => console.error('[airtable] odświeżenie FAIL (serwuję stary cache):', e.message)).finally(() => { refreshing = null; });
  }
  const styles = [...new Set(cache.artists.flatMap((a) => a.styles))].sort((a, b) => a.localeCompare(b, 'pl'));
  const programs = [...new Set(cache.artists.flatMap((a) => a.programs || []))].sort((a, b) => a.localeCompare(b, 'pl'));
  return {
    mock: MOCK,
    styles,
    programs,
    eventTypes: EVENT_TYPES,
    artists: cache.artists,
    fetchedAt: cache.fetchedAt,
  };
}

export async function getArtistById(id) {
  const c = await getCatalog();
  return c.artists.find((a) => a.id === id) || null;
}

export async function getPhotoDriveId(recId) {
  if (!cache) await getCatalog();
  return cache.photoIds.get(recId) || null;
}

/* ---------- zajęte terminy (tabela "Imprezy" w bazie Kalendarz Imprez) ----------
   Każdy wpis (Rezerwacja/Podpisane/Zajęte/Potwierdzona/...) blokuje wykonawcę
   w danym dniu — nie pokazujemy go w katalogu i nie wysyłamy do niego zapytania.
   Imprezy linkują do DOWOLNEGO rekordu Cennika (także duplikatu), więc mapujemy
   po nazwie na kanoniczne ID z katalogu. */
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE || 'Imprezy';

async function fetchPage(u) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${AK}` } });
    if (r.status === 429) { await sleep(700); continue; }
    const j = await r.json();
    if (Array.isArray(j.records)) return j;
    await sleep(400);
  }
  throw new Error('Airtable: brak odpowiedzi po retry');
}

async function fetchBusy() {
  await getCatalog(); // upewnij się, że katalog (kanoniczne ID) jest w cache
  const canonByName = new Map(cache.artists.map((a) => [a.name.trim().toLowerCase(), a.id]));

  // id -> nazwa dla WSZYSTKICH rekordów Cennika (bez filtra widoczności — duplikaty też)
  const idToName = new Map();
  let offset = '';
  do {
    const u = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`
      + `?pageSize=100&fields%5B%5D=${encodeURIComponent('Wykonawca')}` + (offset ? `&offset=${offset}` : '');
    const j = await fetchPage(u);
    for (const rec of j.records) idToName.set(rec.id, String(rec.fields?.['Wykonawca'] || '').trim().toLowerCase());
    offset = j.offset || '';
  } while (offset);

  // przyszłe imprezy (od dziś włącznie)
  const byDate = new Map();
  offset = '';
  const formula = encodeURIComponent("IS_AFTER({Data imprezy}, DATEADD(TODAY(), -1, 'days'))");
  do {
    const u = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(EVENTS_TABLE)}`
      + `?pageSize=100&filterByFormula=${formula}`
      + `&fields%5B%5D=${encodeURIComponent('Wykonawca')}&fields%5B%5D=${encodeURIComponent('Data imprezy')}`
      + (offset ? `&offset=${offset}` : '');
    const j = await fetchPage(u);
    for (const rec of j.records) {
      const date = String(rec.fields?.['Data imprezy'] || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      for (const rid of asArray(rec.fields?.['Wykonawca'])) {
        const canon = canonByName.get(idToName.get(rid) || '') || rid;
        if (!byDate.has(date)) byDate.set(date, new Set());
        byDate.get(date).add(canon);
      }
    }
    offset = j.offset || '';
  } while (offset);
  return byDate;
}

function loadMockBusy() {
  try {
    const raw = JSON.parse(readFileSync(join(DIR, '..', 'data', 'mock-busy.json'), 'utf8'));
    return new Map(Object.entries(raw).map(([d, ids]) => [d, new Set(ids)]));
  } catch { return new Map(); }
}

let busyCache = null; // { byDate: Map, fetchedAt }
let busyRefreshing = null;

export async function getBusyIds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return [];
  if (!busyCache) {
    busyCache = { byDate: MOCK ? loadMockBusy() : await fetchBusy(), fetchedAt: new Date().toISOString() };
  } else if (Date.now() - Date.parse(busyCache.fetchedAt) > TTL && !busyRefreshing) {
    busyRefreshing = (async () => {
      try { busyCache = { byDate: MOCK ? loadMockBusy() : await fetchBusy(), fetchedAt: new Date().toISOString() }; }
      catch (e) { console.error('[airtable] odświeżenie terminów FAIL (serwuję stare):', e.message); }
      finally { busyRefreshing = null; }
    })();
  }
  return [...(busyCache.byDate.get(date) || [])];
}
