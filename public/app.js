// Generator zapytań — wizard SPA (vanilla JS, bez zależności)
'use strict';

/* ---------- GA4 (gtag.js ładowany z index.html; dataLayer działa też gdy skrypt zablokowany) ---------- */
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-MN652H7DZM');

/* ---------- stan ---------- */
const state = {
  view: 'landing',
  organizer: { name: '', company: '', phone: '', email: '' },
  leadId: null,            // lead w Bitrix założony po kroku danych organizatora
  eventTypes: [],
  budget: null,            // { label, ceil } | null
  styles: [],
  programs: [],            // wybrane programy (Koncert tematyczny)
  occasion: '',            // okazja (Impreza okolicznościowa); 'inne' -> occasionOther
  occasionOther: '',
  selected: [],            // [{id, name, priceLabel, custom?}]
  event: { date: '', city: '', postalCode: '', voivodeship: '', venueType: '' },
  busy: [],                // ID wykonawców zajętych w wybranym terminie
  message: '',
  search: '',
  catalog: null,           // odpowiedź GET /api/artists
  submitting: false,
};

// zajęci wykonawcy w danym dniu — katalog ich nie pokazuje, zapytanie nie wychodzi
async function loadBusy() {
  const date = state.event.date;
  if (!date) { state.busy = []; return; }
  try {
    const r = await fetch(`/api/busy?date=${encodeURIComponent(date)}`);
    const j = await r.json();
    state.busy = Array.isArray(j.busy) ? j.busy : [];
  } catch { state.busy = []; }
}

const BUDGETS = [
  { label: 'do 10 tys. zł', ceil: 10000 },
  { label: 'do 20 tys. zł', ceil: 20000 },
  { label: 'do 30 tys. zł', ceil: 30000 },
  { label: 'do 40 tys. zł', ceil: 40000 },
  { label: 'do 50 tys. zł', ceil: 50000 },
  { label: 'budżet nie jest ograniczeniem', ceil: null },
];
const VENUES = ['plener', 'sala', 'namiot', 'scena plenerowa'];
const OCCASIONS = ['18 urodziny', '40 urodziny', '50 urodziny', 'wesele', 'ślub', 'inne'];

// kroki kreatora zależą od wybranego typu wydarzenia (okazja / program to kroki warunkowe)
function kreatorSteps() {
  const steps = ['kreator-typ'];
  if (state.eventTypes.includes('Impreza okolicznościowa')) steps.push('kreator-okazja');
  if (state.eventTypes.includes('Koncert tematyczny') && (state.catalog?.programs || []).length) steps.push('kreator-program');
  steps.push('kreator-budzet', 'kreator-styl');
  return steps;
}
function allSteps() {
  return ['organizer', 'termin', 'path', ...kreatorSteps(), 'katalog', 'summary'];
}
const historyStack = [];

/* ---------- ikony SVG ---------- */
const IC = {
  plener: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="7" r="3.2"/><path d="M4 21c1-4 4-6.5 8-6.5s7 2.5 8 6.5"/><path d="M2 11l2.5-4L7 11M17 11l2.5-4L22 11"/></svg>',
  firma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="10" height="17"/><path d="M14 9h6v12H4M7 8h1.5M7 12h1.5M7 16h1.5M11 8h.5M11 12h.5M11 16h.5M17 13h.5M17 17h.5"/></svg>',
  okolicznosc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v3M12 3l-1.2 1.6M12 3l1.2 1.6"/><path d="M7 9h10l1.5 12h-13z"/><path d="M9 13c1 .8 2 .8 3 0s2-.8 3 0"/></svg>',
  kultura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5c2.5 0 4.5 1 4.5 1v13S6.5 18 4 18zM20 5c-2.5 0-4.5 1-4.5 1v13s2-1 4.5-1zM8.5 6c2-1 5-1 7 0"/></svg>',
  koncert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18V6l10-2v11.5"/><circle cx="6.8" cy="18.2" r="2.6"/><circle cx="16.8" cy="15.7" r="2.6"/></svg>',
  kreator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18.5" cy="16.5" r="3.4"/><path d="m21 19 1.6 1.6"/></svg>',
  katalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1"/><rect x="13" y="13" width="7.5" height="7.5" rx="1"/></svg>',
  nuta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18V5l9-1.5V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="15.5" cy="16" r="2.5"/></svg>',
  yt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a4 4 0 0 0-.8-1.8 2.9 2.9 0 0 0-2-.8C17.4 4.3 12 4.3 12 4.3s-5.4 0-8.2.3a2.9 2.9 0 0 0-2 .8A4 4 0 0 0 1 7.2 41 41 0 0 0 .7 12 41 41 0 0 0 1 16.8a4 4 0 0 0 .8 1.8 2.9 2.9 0 0 0 2 .8c2.8.3 8.2.3 8.2.3s5.4 0 8.2-.3a2.9 2.9 0 0 0 2-.8 4 4 0 0 0 .8-1.8A41 41 0 0 0 23.3 12 41 41 0 0 0 23 7.2zM9.8 15.3V8.7l5.7 3.3z"/></svg>',
};
const EVENT_ICONS = { 'Impreza plenerowa': IC.plener, 'Impreza firmowa': IC.firma, 'Impreza okolicznościowa': IC.okolicznosc, 'Wydarzenie kulturalne': IC.kultura, 'Koncert tematyczny': IC.koncert };
const EVENT_HINTS = {
  'Impreza plenerowa': 'dni miasta, dożynki, festyny',
  'Impreza firmowa': 'event firmowy, gala, jubileusz firmy',
  'Impreza okolicznościowa': 'urodziny, jubileusz, prywatna uroczystość',
  'Wydarzenie kulturalne': 'spotkanie autorskie, biblioteka, seniorzy',
  'Koncert tematyczny': 'kolędy, koncert noworoczny, patriotyczny',
};

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function saveSnapshot() {
  try { sessionStorage.setItem('gz-state', JSON.stringify({ ...state, catalog: null, submitting: false })); } catch { /* ignore */ }
}
function loadSnapshot() {
  try {
    const raw = sessionStorage.getItem('gz-state');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && s.view && s.view !== 'confirm') {
      Object.assign(state, s, { catalog: null, submitting: false });
      // migracja starszych snapshotow: brakujace pola -> puste wartosci
      state.event = { date: '', city: '', postalCode: '', voivodeship: '', venueType: '', ...(s.event || {}) };
      for (const k of Object.keys(state.event)) if (state.event[k] == null) state.event[k] = '';
      if (!Array.isArray(state.programs)) state.programs = [];
      if (!Array.isArray(state.busy)) state.busy = [];
      state.organizer = { name: '', company: '', phone: '', email: '', ...(s.organizer || {}) };
      if (state.leadId !== null && typeof state.leadId !== 'string' && typeof state.leadId !== 'number') state.leadId = null;
      // sesja sprzed wersji z polem "Imię i nazwisko": wróć do formularza (dane zostają wypełnione)
      if (!state.organizer.name && !['landing', 'organizer'].includes(state.view)) state.view = 'organizer';
      if (typeof state.occasion !== 'string') state.occasion = '';
      if (typeof state.occasionOther !== 'string') state.occasionOther = '';
    }
  } catch { /* ignore */ }
}

/* ---------- nawigacja ---------- */
function show(view, { push = true } = {}) {
  if (push && state.view !== view) historyStack.push(state.view);
  state.view = view;
  document.querySelectorAll('section[data-view]').forEach((s) => s.classList.toggle('active', s.dataset.view === view));
  renderProgress();
  renderView(view);
  updateSelectionBar();
  saveSnapshot();
  window.scrollTo({ top: 0 });
}
function goBack() {
  const prev = historyStack.pop();
  if (prev) show(prev, { push: false });
}

function renderProgress() {
  const bar = $('#progress');
  const label = $('#progress-label');
  const steps = allSteps();
  const idx = steps.indexOf(state.view);
  const hidden = idx < 0;
  bar.hidden = hidden; label.hidden = hidden;
  if (hidden) return;
  const total = steps.length;
  bar.innerHTML = steps.map((_, i) => `<span class="${i <= idx ? 'done' : ''}"></span>`).join('');
  label.textContent = `Krok ${idx + 1} z ${total}`;
}

/* ---------- katalog: pobranie ---------- */
async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const r = await fetch('/api/artists');
  if (!r.ok) throw new Error('api');
  state.catalog = await r.json();
  return state.catalog;
}

/* ---------- render widoków ---------- */
function renderView(view) {
  if (view === 'termin') {
    const el = $('#f-date0');
    el.value = state.event.date;
    el.min = new Date().toISOString().slice(0, 10);
  }
  if (view === 'path') renderPathTiles();
  if (view === 'kreator-typ') renderEventTypeTiles();
  if (view === 'kreator-okazja') renderOccasionTiles();
  if (view === 'kreator-program') renderProgramTiles();
  if (view === 'kreator-budzet') renderBudgetTiles();
  if (view === 'kreator-styl') renderStyleTiles();
  if (view === 'katalog') renderCatalog();
  if (view === 'summary') renderSummary();
}

function tileHtml({ key, title, sub, icon, selected }) {
  return `<button type="button" class="tile ${selected ? 'selected' : ''}" data-tile="${esc(key)}">
    <span class="icon">${icon || IC.nuta}</span>
    <span class="tile-body">${esc(title)}${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ''}</span>
    <span class="tile-check">&#10003;</span>
  </button>`;
}

function renderPathTiles() {
  $('#path-tiles').innerHTML =
    tileHtml({ key: 'kreator', title: 'Kreator krok po kroku', sub: 'Odpowiesz na 3 pytania, a my dopasujemy artystów', icon: IC.kreator, selected: false }) +
    tileHtml({ key: 'katalog', title: 'Przeglądaj katalog samodzielnie', sub: 'Wszyscy artyści od razu, z filtrami i wyszukiwarką', icon: IC.katalog, selected: false });
}

function renderEventTypeTiles() {
  const types = state.catalog?.eventTypes || Object.keys(EVENT_ICONS);
  $('#event-type-tiles').innerHTML = types.map((t) => tileHtml({
    key: t, title: t, sub: EVENT_HINTS[t] || '', icon: EVENT_ICONS[t], selected: state.eventTypes.includes(t),
  })).join('');
}

function renderOccasionTiles() {
  $('#occasion-tiles').innerHTML = OCCASIONS.map((o) => tileHtml({
    key: o, title: o === 'inne' ? 'inne (dodaj)' : o, sub: '', icon: IC.okolicznosc, selected: state.occasion === o,
  })).join('');
  const other = $('#occasion-other-field');
  other.hidden = state.occasion !== 'inne';
  if (!other.hidden) { $('#f-occasion-other').value = state.occasionOther; $('#f-occasion-other').focus(); }
}

function renderProgramTiles() {
  const programs = state.catalog?.programs || [];
  $('#program-tiles').innerHTML = programs.map((p) => tileHtml({
    key: p, title: p, sub: '', icon: IC.koncert, selected: state.programs.includes(p),
  })).join('');
}

function renderBudgetTiles() {
  $('#budget-tiles').innerHTML = BUDGETS.map((b) => tileHtml({
    key: b.label, title: b.label, sub: '', icon: null, selected: state.budget?.label === b.label,
  })).join('');
}

function renderStyleTiles() {
  const styles = state.catalog?.styles || [];
  $('#style-tiles').innerHTML = styles.map((s) => tileHtml({
    key: s, title: s, sub: '', icon: IC.nuta, selected: state.styles.includes(s),
  })).join('');
}

/* ---------- katalog ---------- */
function matchesFilters(a) {
  if (state.event.date && state.busy.includes(a.id)) return false;
  if (state.budget && state.budget.ceil !== null) {
    if (a.priceRange.from !== null && a.priceRange.from > state.budget.ceil) return false;
  }
  if (state.styles.length && !a.styles.some((s) => state.styles.includes(s))) return false;
  if (state.programs.length && !(a.programs || []).some((p) => state.programs.includes(p))) return false;
  if (state.eventTypes.length && a.eventTypes.length && !a.eventTypes.some((t) => state.eventTypes.includes(t))) return false;
  if (state.search) {
    const q = state.search.toLowerCase();
    if (!a.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

function sortArtists(list) {
  return [...list].sort((x, y) =>
    (y.priority - x.priority)
    || (Number(y.hasPhoto) - Number(x.hasPhoto))
    || (Number(!!y.description) - Number(!!x.description))
    || x.name.localeCompare(y.name, 'pl'));
}

function renderCatalogFilters() {
  const c = state.catalog;
  const chip = (group, key, label, selected) =>
    `<button type="button" class="chip ${selected ? 'selected' : ''}" data-chip-group="${group}" data-chip="${esc(key)}">${esc(label)}</button>`;
  $('#catalog-filters').innerHTML = `
    <div class="filter-group"><b>Rodzaj wydarzenia</b><div class="chips">
      ${c.eventTypes.map((t) => chip('eventType', t, t, state.eventTypes.includes(t))).join('')}
    </div></div>
    <div class="filter-group"><b>Budżet</b><div class="chips">
      ${BUDGETS.map((b) => chip('budget', b.label, b.label, state.budget?.label === b.label)).join('')}
    </div></div>
    <div class="filter-group"><b>Styl</b><div class="chips">
      ${c.styles.map((s) => chip('style', s, s, state.styles.includes(s))).join('')}
    </div></div>
    ${(c.programs || []).length ? `<div class="filter-group"><b>Program</b><div class="chips">
      ${c.programs.map((p) => chip('program', p, p, state.programs.includes(p))).join('')}
    </div></div>` : ''}`;
}

function artistCardHtml(a) {
  const picked = state.selected.some((x) => x.id === a.id);
  return `<article class="artist-card ${picked ? 'selected' : ''}" data-artist="${esc(a.id)}">
    <img class="photo" src="${esc(a.photoUrl)}" alt="${esc(a.name)}" loading="lazy">
    <div class="body">
      <h3>${esc(a.name)}</h3>
      <span class="price-badge"><small>orientacyjnie</small>${esc(a.priceRange.label)}</span>
      <div class="card-actions">
        <button type="button" class="pick-btn ${picked ? 'picked' : ''}" data-pick="${esc(a.id)}">${picked ? '&#10003; Wybrano' : '+ Dodaj'}</button>
      </div>
    </div>
  </article>`;
}

function renderCatalog() {
  const c = state.catalog;
  if (!c) return;
  renderCatalogFilters();
  $('#search-input').value = state.search;
  const list = sortArtists(c.artists.filter(matchesFilters));
  $('#artist-grid').innerHTML = list.map(artistCardHtml).join('');
  $('#catalog-count').textContent = list.length
    ? `Znaleziono ${list.length} ${list.length === 1 ? 'artystę' : list.length < 5 ? 'artystów' : 'artystów'} pasujących do Twoich kryteriów.`
    : '';
  renderNoResults(list);
}

function renderNoResults(list) {
  const box = $('#no-results');
  const q = state.search.trim();
  if (list.length) { box.innerHTML = ''; return; }
  const alreadyAdded = q && state.selected.some((x) => x.custom && x.name.toLowerCase() === q.toLowerCase());
  box.innerHTML = `<div class="no-results">
    <b>${q ? `Nie mamy „${esc(q)}" w naszej bazie` : 'Brak artystów dla wybranych filtrów'}</b>
    <p>${q
      ? 'Nic straconego — dodaj tego wykonawcę do zapytania, a my zweryfikujemy jego dostępność i cenę i wrócimy z informacją.'
      : 'Zmień filtry albo wyszukaj wykonawcę po nazwie.'}</p>
    ${q && !alreadyAdded ? `<button type="button" class="btn btn-action" data-action="add-custom">+ Dodaj „${esc(q)}" do zapytania</button>` : ''}
    ${alreadyAdded ? '<p><b>&#10003; Dodano do zapytania</b></p>' : ''}
  </div>`;
}

/* ---------- modal artysty ---------- */
// ID wideo z linku YouTube (watch / youtu.be / shorts / embed / live); brak -> null
function ytId(u) {
  const m = String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Osadzony odtwarzacz (youtube-nocookie) zamiast odsyłania — organizator zostaje w aplikacji.
function ytEmbedHtml(url, i, total) {
  const id = ytId(url);
  if (!id) {
    return `<a class="yt-fallback" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${IC.yt}<span>Zobacz na YouTube${total > 1 ? ` (${i + 1})` : ''}</span></a>`;
  }
  return `<div class="yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}"
    title="Wideo ${i + 1}" loading="lazy" allowfullscreen
    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

function openModal(a) {
  const picked = state.selected.some((x) => x.id === a.id);
  $('#modal').innerHTML = `
    <button type="button" class="modal-close" data-action="close-modal" aria-label="Zamknij">&#10005;</button>
    <img class="photo" src="${esc(a.photoUrl)}" alt="${esc(a.name)}">
    <div class="modal-body">
      <h2>${esc(a.name)}</h2>
      <div class="modal-top-action">
        <button type="button" class="btn ${picked ? 'btn-secondary' : 'btn-action'}" data-pick="${esc(a.id)}" data-action="close-modal">
          ${picked ? 'Usuń z zapytania' : '+ Dodaj do zapytania'}
        </button>
        <span class="price-badge"><small>orientacyjnie</small>${esc(a.priceRange.label)}</span>
      </div>
      <div class="genre-tags">${a.styles.map((s) => `<span class="genre-tag">${esc(s)}</span>`).join('')}</div>
      ${(a.programs || []).length ? `<p class="hint" style="margin:2px 0 8px;">Programy: ${a.programs.map(esc).join(' · ')}</p>` : ''}
      <p class="desc">${esc(a.description || a.shortDescription)}</p>
      ${a.youtube.length ? `<div class="yt-links">
        <p class="hint" style="margin:0 0 2px;">Posłuchaj na żywo:</p>
        ${a.youtube.map((u, i) => ytEmbedHtml(u, i, a.youtube.length)).join('')}</div>` : ''}
      ${a.pageUrl ? `<a class="more-link" href="${esc(a.pageUrl)}" target="_blank" rel="noopener noreferrer">więcej na impresariatkoncertowy.pl &rarr;</a>` : ''}
      <div class="nav-row" style="margin-top:14px;">
        <button type="button" class="btn ${picked ? 'btn-secondary' : 'btn-action'}" data-pick="${esc(a.id)}" data-action="close-modal">
          ${picked ? 'Usuń z zapytania' : '+ Dodaj do zapytania'}
        </button>
      </div>
      <p class="hint" style="margin-top:12px;">Dostępność w Twoim terminie i finalną cenę potwierdzimy po otrzymaniu zapytania.</p>
    </div>`;
  $('#modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ---------- galeria landing (bez cen) ---------- */
function renderLandingGallery() {
  const box = $('#landing-gallery');
  const grid = $('#gallery-grid');
  const artists = state.catalog?.artists || [];
  if (!artists.length) { box.hidden = true; return; }
  const items = sortArtists(artists).slice(0, 18);
  grid.innerHTML = items.map((a) => `
    <button type="button" class="gallery-item" data-action="start" aria-label="${esc(a.name)} — rozpocznij zapytanie">
      <img src="${esc(a.photoUrl)}" alt="${esc(a.name)}" loading="lazy">
      <span>${esc(a.name)}</span>
    </button>`).join('');
  box.hidden = false;
}

/* ---------- wybór artystów ---------- */
function togglePick(id) {
  const i = state.selected.findIndex((x) => x.id === id);
  if (i >= 0) state.selected.splice(i, 1);
  else {
    const a = state.catalog.artists.find((x) => x.id === id);
    if (!a) return;
    if (state.selected.length >= 20) { alert('Można wybrać maksymalnie 20 wykonawców.'); return; }
    state.selected.push({ id: a.id, name: a.name, priceLabel: a.priceRange.label });
  }
  if (state.view === 'katalog') renderCatalog();
  if (state.view === 'summary') renderSummary();
  updateSelectionBar();
  saveSnapshot();
}

function addCustomArtist(name) {
  const n = name.trim();
  if (n.length < 2) return;
  if (state.selected.filter((x) => x.custom).length >= 5) { alert('Można dodać maksymalnie 5 wykonawców spoza bazy.'); return; }
  if (!state.selected.some((x) => x.custom && x.name.toLowerCase() === n.toLowerCase())) {
    state.selected.push({ id: `custom-${Date.now()}`, name: n, priceLabel: 'do weryfikacji', custom: true });
  }
  state.search = '';
  renderCatalog();
  updateSelectionBar();
  saveSnapshot();
}

function updateSelectionBar() {
  const bar = $('#selection-bar');
  const n = state.selected.length;
  const inCatalog = state.view === 'katalog';
  bar.classList.toggle('visible', inCatalog && n > 0);
  if (n) $('#selection-count').textContent = `Wybrano: ${n} ${n === 1 ? 'wykonawca' : n < 5 ? 'wykonawców' : 'wykonawców'}`;
}

/* ---------- podsumowanie ---------- */
const occasionValue = () => (state.occasion === 'inne' ? state.occasionOther.trim() : state.occasion);

function renderSummary() {
  const parts = [];
  if (state.eventTypes.length) parts.push(`<b>${esc(state.eventTypes.join(', '))}</b>`);
  if (occasionValue()) parts.push(`okazja: <b>${esc(occasionValue())}</b>`);
  if (state.programs.length) parts.push(`program: <b>${esc(state.programs.join(', '))}</b>`);
  if (state.budget) parts.push(`budżet: <b>${esc(state.budget.label)}</b>`);
  if (state.styles.length) parts.push(`styl: <b>${esc(state.styles.join(', '))}</b>`);
  $('#summary-meta').innerHTML = parts.length ? parts.join(' &middot; ') : 'Przeglądanie katalogu bez filtrów';

  $('#summary-artists').innerHTML = state.selected.map((a) => `
    <div class="summary-item">
      <span class="nm">${esc(a.name)}</span>
      ${a.custom ? '<span class="custom-badge">spoza bazy — do weryfikacji</span>' : `<span class="pr">${esc(a.priceLabel)}</span>`}
      <button type="button" data-remove="${esc(a.id)}" aria-label="Usuń ${esc(a.name)}">&#10005;</button>
    </div>`).join('') || '<p class="hint">Nie wybrano jeszcze żadnego artysty.</p>';

  // wykonawcy zajęci w wybranym terminie (np. po zmianie daty w podsumowaniu)
  const busySelected = state.selected.filter((x) => !x.custom && state.event.date && state.busy.includes(x.id));
  $('#busy-warning').innerHTML = busySelected.length ? `<div class="busy-warning">
      <b>W wybranym terminie niedostępni: ${busySelected.map((x) => esc(x.name)).join(', ')}.</b>
      <p>Zmień datę wydarzenia albo usuń ich z zapytania — pozostałym wykonawcom wyślemy je od razu.</p>
      <button type="button" class="btn btn-secondary" data-action="remove-busy">Usuń niedostępnych z zapytania</button>
    </div>` : '';
  $('#submit-btn').disabled = !!busySelected.length;

  $('#venue-chips').innerHTML = VENUES.map((v) =>
    `<button type="button" class="chip ${state.event.venueType === v ? 'selected' : ''}" data-venue="${esc(v)}">${esc(v)}</button>`).join('');
  $('#f-date').value = state.event.date;
  $('#f-city').value = state.event.city;
  $('#f-postal').value = state.event.postalCode;
  $('#f-voivodeship').value = state.event.voivodeship;
  $('#f-message').value = state.message;
  const today = new Date();
  $('#f-date').min = today.toISOString().slice(0, 10);
}

/* ---------- walidacja organizatora ---------- */
function validateOrganizer() {
  const name = $('#f-contact-name').value.trim();
  const company = $('#f-company').value.trim();
  const phoneDigits = $('#f-phone').value.replace(/[\s\-().]/g, '').replace(/^\+?48/, '');
  const email = $('#f-email').value.trim();
  const results = {
    contactName: name.length >= 3,
    company: company.length >= 2,
    phone: /^\d{9}$/.test(phoneDigits),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email),
  };
  for (const [key, ok] of Object.entries(results)) {
    document.querySelector(`.field[data-field="${key}"]`)?.classList.toggle('invalid', !ok);
  }
  if (Object.values(results).every(Boolean)) {
    state.organizer = { name, company, phone: $('#f-phone').value.trim(), email };
    return true;
  }
  return false;
}

// walidacja domeny e-mail (MX) + podpowiedź literówki; awaria = przepuszczamy (fail-open)
async function checkEmailDomain(email) {
  try {
    const r = await fetch(`/api/check-email?email=${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(4000) });
    return await r.json();
  } catch { return { ok: true, suggestion: null }; }
}

let emailWarnedFor = ''; // przy podpowiedzi zatrzymujemy tylko raz — drugi klik "Dalej" przepuszcza
async function handleOrganizerNext(btn) {
  if (!validateOrganizer()) return;
  const oldLabel = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sprawdzam…';
  const res = await checkEmailDomain(state.organizer.email);
  btn.disabled = false; btn.textContent = oldLabel;

  const field = document.querySelector('.field[data-field="email"]');
  const sug = $('#email-suggest');
  if (res.suggestion) {
    sug.textContent = `Czy chodziło o …@${res.suggestion}? Kliknij, żeby poprawić.`;
    sug.dataset.domain = res.suggestion;
    sug.hidden = false;
  } else { sug.hidden = true; }

  if (!res.ok) {
    $('#email-err').textContent = 'Ten adres wygląda na błędny — taka domena nie istnieje. Sprawdź e-mail.';
    field.classList.add('invalid');
    return;
  }
  if (res.suggestion && emailWarnedFor !== state.organizer.email) {
    emailWarnedFor = state.organizer.email; // pierwszy raz: pokaż podpowiedź; ponowny klik = przejście
    return;
  }
  field.classList.remove('invalid');
  registerLead();
  show('termin');
}

// po pierwszym kroku od razu zakładamy lead w Bitrix — nawet jeśli organizator
// nie dokończy zapytania, zespół ma kontakt; wysłane zapytanie konwertuje lead w deal
async function registerLead() {
  if (state.leadId) return;
  try {
    const r = await fetch('/api/lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizer: state.organizer, website: $('#f-website').value }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.leadId) { state.leadId = j.leadId; saveSnapshot(); }
  } catch { /* lead jest best-effort, nie blokuje przejścia dalej */ }
}

/* ---------- wysyłka ---------- */
async function submitInquiry() {
  if (state.submitting) return;
  state.event.date = $('#f-date').value;
  state.event.city = $('#f-city').value.trim();
  state.event.postalCode = $('#f-postal').value.trim();
  state.event.voivodeship = $('#f-voivodeship').value;
  state.message = $('#f-message').value.trim();

  const errBox = $('#submit-error');
  errBox.classList.remove('visible');
  if (!state.organizer.name || !state.organizer.email) {
    // niekompletne dane organizatora (np. stara sesja) — wróć do formularza zamiast błędu na końcu
    show('organizer');
    return;
  }
  const postal = state.event.postalCode.replace(/\s/g, '');
  if (postal && !/^\d{2}-?\d{3}$/.test(postal)) {
    document.querySelector('.field[data-field="postal"]').classList.add('invalid');
    errBox.textContent = 'Popraw kod pocztowy (format 00-000).';
    errBox.classList.add('visible');
    return;
  }
  document.querySelector('.field[data-field="postal"]').classList.remove('invalid');
  state.event.postalCode = postal ? postal.replace(/^(\d{2})-?(\d{3})$/, '$1-$2') : '';
  if (!state.selected.length) {
    errBox.textContent = 'Wybierz co najmniej jednego artystę.';
    errBox.classList.add('visible');
    return;
  }

  const payload = {
    organizer: state.organizer,
    eventTypes: state.eventTypes,
    budget: state.budget?.label || '',
    styles: state.styles,
    programs: state.programs,
    occasion: occasionValue(),
    artists: state.selected.filter((a) => !a.custom).map((a) => ({ id: a.id })),
    customArtists: state.selected.filter((a) => a.custom).map((a) => a.name),
    event: state.event,
    message: state.message,
    leadId: state.leadId,
    website: $('#f-website').value, // honeypot
  };

  state.submitting = true;
  const btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = 'Wysyłanie…';
  try {
    const r = await fetch('/api/inquiry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      // konwersja GA4 (Tomek podpina pod reklamy w GTM)
      try {
        gtag('event', 'zapytanie', {
          artists_count: payload.artists.length,
          custom_artists_count: payload.customArtists.length,
          event_types: payload.eventTypes.join(', ') || '(brak)',
          budget: payload.budget || '(brak)',
        });
      } catch { /* analityka nie może blokować potwierdzenia */ }
      $('#confirm-custom').hidden = !payload.customArtists.length;
      sessionStorage.removeItem('gz-state');
      show('confirm');
    } else {
      errBox.textContent = j.error || 'Nie udało się wysłać zapytania. Spróbuj ponownie.';
      errBox.classList.add('visible');
    }
  } catch {
    errBox.textContent = 'Błąd połączenia. Sprawdź internet i spróbuj ponownie.';
    errBox.classList.add('visible');
  } finally {
    state.submitting = false;
    btn.disabled = false;
    btn.textContent = 'Wyślij zapytanie o dostępność';
  }
}

/* ---------- obsługa zdarzeń (delegacja) ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], [data-tile], [data-chip], [data-pick], [data-artist], [data-remove], [data-venue], [data-suggest]');
  if (!t) return;

  if (t.dataset.suggest !== undefined) {
    const a = state.catalog?.artists.find((x) => x.id === t.dataset.suggest);
    $('#search-suggest').hidden = true;
    if (a) {
      state.search = a.name;
      $('#search-input').value = a.name;
      renderCatalog();
      openModal(a);
      saveSnapshot();
    }
    return;
  }

  const action = t.dataset.action;
  if (action === 'start') { ensureCatalog(); show('organizer'); return; }
  if (action === 'back') { goBack(); return; }
  if (action === 'organizer-next') { handleOrganizerNext(t); return; }
  if (action === 'apply-email-suggest') {
    const el = $('#f-email');
    el.value = el.value.replace(/@.*$/, '@' + t.dataset.domain);
    t.hidden = true;
    $('#email-err').textContent = 'Podaj poprawny adres e-mail.';
    document.querySelector('.field[data-field="email"]').classList.remove('invalid');
    return;
  }
  if (action === 'termin-next') {
    state.event.date = $('#f-date0').value;
    loadBusy().then(() => { if (state.view === 'katalog') renderCatalog(); });
    show('path');
    return;
  }
  if (action === 'termin-skip') { state.event.date = ''; state.busy = []; show('path'); return; }
  if (action === 'remove-busy') {
    state.selected = state.selected.filter((x) => x.custom || !state.busy.includes(x.id));
    renderSummary(); updateSelectionBar(); saveSnapshot();
    return;
  }
  if (action === 'next') {
    const steps = kreatorSteps();
    const i = steps.indexOf(state.view);
    if (i >= 0 && i < steps.length - 1) {
      if (state.view === 'kreator-okazja' && state.occasion === 'inne') state.occasionOther = $('#f-occasion-other').value.trim();
      show(steps[i + 1]);
    }
    return;
  }
  if (action === 'show-catalog') { show('katalog'); return; }
  if (action === 'back-to-path') { show('path'); return; }
  if (action === 'go-summary') { show('summary'); return; }
  if (action === 'back-to-catalog') { show('katalog'); return; }
  if (action === 'submit') { submitInquiry(); return; }
  if (action === 'close-modal') { closeModal(); /* pick może być na tym samym przycisku */ }
  if (action === 'restart') { sessionStorage.removeItem('gz-state'); location.reload(); return; }
  if (action === 'add-custom') { addCustomArtist(state.search); return; }

  if (t.dataset.tile !== undefined) { handleTile(t.dataset.tile); return; }
  if (t.dataset.chip !== undefined) { handleChip(t.dataset.chipGroup, t.dataset.chip); return; }
  if (t.dataset.venue !== undefined) {
    state.event.venueType = state.event.venueType === t.dataset.venue ? '' : t.dataset.venue;
    renderSummary(); saveSnapshot(); return;
  }
  if (t.dataset.remove !== undefined) {
    state.selected = state.selected.filter((x) => x.id !== t.dataset.remove);
    renderSummary(); updateSelectionBar(); saveSnapshot(); return;
  }
  if (t.dataset.pick !== undefined) { togglePick(t.dataset.pick); return; }
  if (t.dataset.artist !== undefined) {
    const a = state.catalog?.artists.find((x) => x.id === t.dataset.artist);
    if (a) openModal(a);
  }
});

// fallback zdjęć bez inline onerror (CSP: script-src 'self')
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && !img.dataset.fb) { img.dataset.fb = '1'; img.src = '/placeholder.svg'; }
}, true);

$('#modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function handleTile(key) {
  if (state.view === 'path') {
    if (key === 'kreator') show('kreator-typ');
    else { state.budget = null; show('katalog'); }
    return;
  }
  if (state.view === 'kreator-typ') {
    const i = state.eventTypes.indexOf(key);
    if (i >= 0) state.eventTypes.splice(i, 1); else state.eventTypes.push(key);
    renderEventTypeTiles();
    renderProgress(); // liczba kroków zależy od wybranych typów
  } else if (state.view === 'kreator-okazja') {
    state.occasion = state.occasion === key ? '' : key;
    renderOccasionTiles();
  } else if (state.view === 'kreator-program') {
    const i = state.programs.indexOf(key);
    if (i >= 0) state.programs.splice(i, 1); else state.programs.push(key);
    renderProgramTiles();
  } else if (state.view === 'kreator-budzet') {
    state.budget = state.budget?.label === key ? null : BUDGETS.find((b) => b.label === key) || null;
    renderBudgetTiles();
  } else if (state.view === 'kreator-styl') {
    const i = state.styles.indexOf(key);
    if (i >= 0) state.styles.splice(i, 1); else state.styles.push(key);
    renderStyleTiles();
  }
  saveSnapshot();
}

function handleChip(group, key) {
  if (group === 'eventType') {
    const i = state.eventTypes.indexOf(key);
    if (i >= 0) state.eventTypes.splice(i, 1); else state.eventTypes.push(key);
  } else if (group === 'budget') {
    state.budget = state.budget?.label === key ? null : BUDGETS.find((b) => b.label === key) || null;
  } else if (group === 'style') {
    const i = state.styles.indexOf(key);
    if (i >= 0) state.styles.splice(i, 1); else state.styles.push(key);
  } else if (group === 'program') {
    const i = state.programs.indexOf(key);
    if (i >= 0) state.programs.splice(i, 1); else state.programs.push(key);
  }
  renderCatalog();
  saveSnapshot();
}

// pola kroku podsumowania -> stan na bieżąco (re-render kafli miejsca nie może kasować wpisów)
for (const [sel, apply] of [
  ['#f-date', (v) => {
    state.event.date = v;
    loadBusy().then(() => { if (state.view === 'summary') renderSummary(); });
  }],
  ['#f-city', (v) => { state.event.city = v; }],
  ['#f-postal', (v) => { state.event.postalCode = v; }],
  ['#f-voivodeship', (v) => { state.event.voivodeship = v; }],
  ['#f-message', (v) => { state.message = v; }],
]) {
  document.querySelector(sel).addEventListener('input', (e) => { apply(e.target.value); saveSnapshot(); });
}

/* ---------- wyszukiwarka: autopodpowiedzi od 3 liter ---------- */
function renderSuggest() {
  const box = $('#search-suggest');
  const q = state.search.trim().toLowerCase();
  if (q.length < 3 || !state.catalog) { box.hidden = true; box.innerHTML = ''; return; }
  const hits = state.catalog.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8);
  if (!hits.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = hits.map((a) => `
    <button type="button" data-suggest="${esc(a.id)}">
      <img src="${esc(a.photoUrl)}" alt="" loading="lazy"><span>${esc(a.name)}</span>
    </button>`).join('');
  box.hidden = false;
}

let searchTimer = null;
$('#search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    renderCatalog();
    renderSuggest();
    saveSnapshot();
  }, 150);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-row')) { $('#search-suggest').hidden = true; }
});

$('#f-occasion-other').addEventListener('input', (e) => { state.occasionOther = e.target.value; saveSnapshot(); });

/* ---------- start ---------- */
async function ensureCatalog() {
  try {
    await loadCatalog();
    renderLandingGallery();
    if (state.event.date) await loadBusy(); // odśwież zajętych po przywróceniu sesji
    if (['kreator-styl', 'katalog', 'summary'].includes(state.view)) renderView(state.view);
  }
  catch (err) {
    console.error(err);
    $('#catalog-count').textContent = 'Nie udało się pobrać listy artystów — odśwież stronę.';
  }
}

loadSnapshot();
ensureCatalog();
show(state.view === 'confirm' ? 'landing' : state.view, { push: false });
// przywróć dane organizatora do pól po odświeżeniu
if (state.organizer.name) $('#f-contact-name').value = state.organizer.name;
if (state.organizer.company) $('#f-company').value = state.organizer.company;
if (state.organizer.phone) $('#f-phone').value = state.organizer.phone;
if (state.organizer.email) $('#f-email').value = state.organizer.email;
