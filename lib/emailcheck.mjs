// Weryfikacja domeny e-mail bez tarcia dla użytkownika:
// 1) czy domena istnieje i przyjmuje pocztę (rekord MX, fallback A/AAAA),
// 2) podpowiedź przy literówce popularnej domeny (gmial.com -> gmail.com).
// Zasada fail-open: błąd naszego DNS/timeout NIGDY nie blokuje użytkownika.
import { resolveMx, resolve4, resolve6 } from 'node:dns/promises';

const POPULAR = [
  'gmail.com', 'wp.pl', 'o2.pl', 'onet.pl', 'op.pl', 'interia.pl', 'poczta.onet.pl',
  'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com', 'gazeta.pl', 'poczta.fm',
  'tlen.pl', 'onet.eu', 'interia.eu', 'vp.pl', 'spoko.pl',
];

function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

// null gdy domena jest OK/nieznana; nazwa popularnej domeny gdy wygląda na literówkę
export function suggestDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d || POPULAR.includes(d)) return null;
  let best = null, bestDist = 3;
  for (const p of POPULAR) {
    const dist = lev(d, p);
    if (dist < bestDist) { bestDist = dist; best = p; }
  }
  if (bestDist === 1) return best;
  if (bestDist === 2 && d.length >= 6) return best;
  return null;
}

const cache = new Map(); // domena -> { ok, ts }
const TTL = 24 * 60 * 60 * 1000;

export async function domainAcceptsMail(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return false;
  const hit = cache.get(d);
  if (hit && Date.now() - hit.ts < TTL) return hit.ok;

  const notFound = (e) => e && (e.code === 'ENOTFOUND' || e.code === 'ENODATA');
  let ok;
  try {
    ok = (await resolveMx(d)).length > 0;
  } catch (e) {
    if (!notFound(e)) ok = true; // SERVFAIL/timeout naszego DNS -> nie blokuj
    else {
      try { ok = (await resolve4(d)).length > 0; }
      catch (e2) {
        if (!notFound(e2)) ok = true;
        else {
          try { ok = (await resolve6(d)).length > 0; }
          catch (e3) { ok = !notFound(e3); }
        }
      }
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(d, { ok, ts: Date.now() });
  return ok;
}

// { ok, suggestion } dla pełnego adresu e-mail
export async function checkEmail(email) {
  const m = String(email || '').toLowerCase().match(/^[^\s@]+@([^\s@]+\.[^\s@]{2,})$/);
  if (!m) return { ok: false, suggestion: null };
  const domain = m[1];
  return { ok: await domainAcceptsMail(domain), suggestion: suggestDomain(domain) };
}
