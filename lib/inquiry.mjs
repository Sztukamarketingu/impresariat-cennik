// Przyjęcie zapytania: walidacja serwerowa, honeypot, rate-limit, forward do n8n.
import { getArtistById, getBusyIds } from './airtable.mjs';

const N8N_URL = process.env.N8N_INQUIRY_WEBHOOK_URL || '';
const TOKEN = process.env.INQUIRY_SHARED_TOKEN || '';

const RATE_MAX = 5;                 // zgłoszeń
const RATE_WINDOW = 15 * 60 * 1000; // na 15 min / IP
const hits = new Map();             // ip -> [timestamps]

const VENUE_TYPES = ['plener', 'sala', 'namiot', 'scena plenerowa'];
const VOIVODESHIPS = ['dolnośląskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie', 'łódzkie', 'małopolskie',
  'mazowieckie', 'opolskie', 'podkarpackie', 'podlaskie', 'pomorskie', 'śląskie', 'świętokrzyskie',
  'warmińsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie'];
const BUDGETS = ['do 10 tys. zł', 'do 20 tys. zł', 'do 30 tys. zł', 'do 40 tys. zł', 'do 50 tys. zł', 'budżet nie jest ograniczeniem'];

// Bitrix po cichu gubi pola z emoji — tniemy WSZYSTKIE znaki astralne + symbole BMP,
// polskie znaki (litery BMP) zostają.
export function stripEmoji(s) {
  return String(s)
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u2190-\u21FF\u2700-\u27BF]/g, '');
}

function clean(s, max) {
  return stripEmoji(String(s ?? ''))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizePhone(s) {
  const digits = String(s).replace(/[\s\-().]/g, '').replace(/^\+?48/, '');
  return /^\d{9}$/.test(digits) ? `+48 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : null;
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (list.length >= RATE_MAX) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) { if (!v.some((t) => now - t < RATE_WINDOW)) hits.delete(k); }
  return false;
}

// Lead po kroku danych organizatora: kontakt trafia do Bitrix nawet gdy
// zapytanie nie zostanie dokończone; wysłane zapytanie konwertuje lead.
const LEAD_URL = process.env.N8N_LEAD_WEBHOOK_URL || '';

export async function handleLead(payload, { ip }) {
  if (clean(payload?.website, 100)) return { status: 200, body: { ok: true } }; // honeypot
  if (rateLimited(`lead:${ip}`)) return { status: 429, body: { ok: false } };

  const org = payload?.organizer || {};
  const name = clean(org.name, 120);
  const company = clean(org.company, 200);
  const email = clean(org.email, 200).toLowerCase();
  const phone = normalizePhone(clean(org.phone, 40) || '');
  if (name.length < 3 || company.length < 2 || !EMAIL_RE.test(email) || !phone) {
    return { status: 400, body: { ok: false } };
  }

  if (!LEAD_URL) {
    console.log('[lead][MOCK]', JSON.stringify({ name, company, email, phone }));
    return { status: 200, body: { ok: true, leadId: 'mock-1', mock: true } };
  }
  try {
    const r = await fetch(LEAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inquiry-Token': TOKEN },
      body: JSON.stringify({ organizer: { name, company, email, phone }, meta: { ip } }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    return { status: 200, body: { ok: true, leadId: j.leadId || null } };
  } catch (e) {
    console.error('[lead] n8n FAIL:', e.message);
    return { status: 200, body: { ok: true, leadId: null } }; // lead best-effort
  }
}

// Zwraca { status, body } — zawsze JSON dla klienta.
export async function handleInquiry(payload, { ip, userAgent }) {
  // honeypot: cicha akceptacja, nic nie robimy
  if (clean(payload?.website, 100)) return { status: 200, body: { ok: true } };

  if (rateLimited(ip)) return { status: 429, body: { ok: false, error: 'Za dużo zgłoszeń. Spróbuj ponownie za kilkanaście minut.' } };

  const errors = [];
  const org = payload?.organizer || {};
  const contactName = clean(org.name, 120);
  const company = clean(org.company, 200);
  const email = clean(org.email, 200).toLowerCase();
  const phone = normalizePhone(clean(org.phone, 40) || '');
  if (contactName.length < 3) errors.push('Podaj imię i nazwisko.');
  if (company.length < 2) errors.push('Podaj nazwę firmy lub instytucji.');
  if (!EMAIL_RE.test(email)) errors.push('Podaj poprawny adres e-mail.');
  if (!phone) errors.push('Podaj poprawny numer telefonu (9 cyfr).');
  const leadId = /^\d{1,10}$/.test(String(payload?.leadId ?? '')) ? String(payload.leadId) : '';

  const eventTypes = (Array.isArray(payload?.eventTypes) ? payload.eventTypes : []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 5);
  const styles = (Array.isArray(payload?.styles) ? payload.styles : []).map((s) => clean(s, 60)).filter(Boolean).slice(0, 15);
  const programs = (Array.isArray(payload?.programs) ? payload.programs : []).map((p) => clean(p, 80)).filter(Boolean).slice(0, 10);
  const occasion = clean(payload?.occasion, 100);
  const budget = BUDGETS.includes(payload?.budget) ? payload.budget : 'nie określono';

  // artyści z bazy: nazwy z cache po ID (użytkownik nie wstrzyknie treści przez name)
  const ids = [...new Set((Array.isArray(payload?.artists) ? payload.artists : []).map((a) => String(a?.id || a || '')))].slice(0, 15);
  const artists = [];
  for (const id of ids) {
    const a = await getArtistById(id).catch(() => null);
    if (a) artists.push({ id: a.id, name: a.name, priceLabel: a.priceRange.label });
  }
  const customArtists = [...new Set((Array.isArray(payload?.customArtists) ? payload.customArtists : [])
    .map((n) => clean(n, 120)).filter((n) => n.length >= 2))].slice(0, 5);
  if (!artists.length && !customArtists.length) errors.push('Wybierz co najmniej jednego artystę.');

  const ev = payload?.event || {};
  const date = clean(ev.date, 10);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Nieprawidłowy format daty.');
    else if (date < new Date().toISOString().slice(0, 10)) errors.push('Data wydarzenia nie może być w przeszłości.');
  }
  const city = clean(ev.city, 120);
  let postalCode = clean(ev.postalCode, 10).replace(/\s/g, '');
  if (postalCode) {
    const m = postalCode.match(/^(\d{2})-?(\d{3})$/);
    if (m) postalCode = `${m[1]}-${m[2]}`;
    else errors.push('Kod pocztowy w formacie 00-000.');
  }
  const voivodeship = VOIVODESHIPS.includes(ev.voivodeship) ? ev.voivodeship : '';
  const venueType = VENUE_TYPES.includes(ev.venueType) ? ev.venueType : '';
  const message = clean(payload?.message, 2000);

  if (errors.length) return { status: 400, body: { ok: false, error: errors.join(' ') } };

  // defensywnie: oznacz wykonawców z zajętym terminem (frontend też filtruje,
  // ale to serwer jest źródłem prawdy) — zespół widzi w dealu, do kogo NIE wysyłać
  if (date && artists.length) {
    const busyIds = await getBusyIds(date).catch(() => []);
    for (const a of artists) if (busyIds.includes(a.id)) a.busy = true;
  }

  const inquiry = {
    organizer: { name: contactName, company, phone, email },
    leadId,
    eventTypes, budget, styles, programs, occasion,
    artists, customArtists,
    event: { date, city, postalCode, voivodeship, venueType },
    message,
    meta: { ip, userAgent: clean(userAgent, 300), submittedAt: new Date().toISOString() },
  };

  if (!N8N_URL) {
    console.log('[inquiry][MOCK] payload:', JSON.stringify(inquiry, null, 2));
    return { status: 200, body: { ok: true, mock: true } };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(N8N_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Inquiry-Token': TOKEN },
        body: JSON.stringify(inquiry),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return { status: 200, body: { ok: true, dealId: j.dealId || null } };
      }
      console.error('[inquiry] n8n status', r.status);
    } catch (e) { console.error('[inquiry] n8n FAIL:', e.message); }
  }
  // nic nie może przepaść — pełny payload do logów (docker logs)
  console.error('[inquiry][NIEDOSTARCZONE] payload:', JSON.stringify(inquiry));
  return { status: 502, body: { ok: false, error: 'Nie udało się wysłać zapytania. Spróbuj ponownie za chwilę lub napisz na kontakt@impresariatkoncertowy.pl.' } };
}
