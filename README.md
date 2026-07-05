# Generator zapytań — sprawdzanie dostępności artystów

Webowa aplikacja dla organizatorów wydarzeń: wizard (dane → typ imprezy → filtry → wybór
artystów → zapytanie). Nie pokazuje terminów ani dokładnych cen — tylko orientacyjne zakresy
per artysta. Zapytanie trafia do n8n → Airtable + Bitrix (lejek organizatora C9) + Anatol.

## Uruchomienie lokalne (tryb mock — bez żadnych kluczy)

```bash
cd "Generator zapytan"
node server.mjs
# → http://localhost:8080  (dane testowe z data/mock-artists.json, zapytania tylko logowane)
```

## Uruchomienie z żywym Airtable

```bash
AIRTABLE_API_KEY=pat... node server.mjs
```

Wymaga wcześniejszego przygotowania bazy — patrz `airtable/AIRTABLE-SETUP.md`
(pola `Cena od`/`Cena do`/`Typ wydarzenia`/`Widoczność w aplikacji` + tabela `Zapytania z aplikacji`).

## Pełna integracja (n8n → Bitrix → Anatol)

1. Import workflow: `n8n/workflow-zapytania.json` + instrukcja w `n8n/WORKFLOW.md`.
2. `N8N_INQUIRY_WEBHOOK_URL=... INQUIRY_SHARED_TOKEN=... node server.mjs`.

## Deploy na VPS

`./deploy.sh` + snippet z `docker-compose.snippet.yml` do `/docker/openclaw-jb6z/docker-compose.yml`.
Subdomena/HTTPS: `Caddyfile.snippet`. Szczegóły i pułapki: `PLAN.md`.

## Architektura

```
przeglądarka ── /api/artists  ──> server.mjs ──> Airtable "Cennik 2026" (cache 10 min)
    │           /api/photo/:id ──> proxy zdjęć Google Drive (cache dyskowy, placeholder)
    └────────── /api/inquiry ────> walidacja + honeypot + rate-limit ──> webhook n8n
                                                                          ├─> Airtable "Zapytania z aplikacji"
                                                                          ├─> Bitrix crm.deal.add (C9:NEW, Anatol)
                                                                          └─> hook do Anatola (intake)
```

Zero zależności npm (Node 20+, built-in http + fetch), frontend vanilla JS bez build stepu.
Publiczne API nie ujawnia: dokładnych cen (`Cena nasza`/`Cena ich`), rozliczeń, riderów
ani kontaktów managerów.

## Pliki

| Plik | Rola |
|---|---|
| `server.mjs` | serwer HTTP: statyka + 3 endpointy API |
| `lib/airtable.mjs` | katalog artystów: fetch, cache, dedup, zakresy cen, sanityzacja |
| `lib/photos.mjs` | proxy + cache zdjęć z Drive |
| `lib/inquiry.mjs` | walidacja zapytania, strip emoji, honeypot, rate-limit, forward do n8n |
| `public/` | frontend (index.html, app.js, styles.css — branding „wariant C") |
| `data/mock-artists.json` | dane testowe (Faza A) |
| `n8n/` | workflow do importu + dokumentacja |
| `airtable/AIRTABLE-SETUP.md` | checklist zmian schematu Airtable |
| `scripts/sync-photos.sh` | plan B na zdjęcia (gog → cache), gdy Drive nie jest publiczny |
| `deploy.sh`, `Dockerfile`, `docker-compose.snippet.yml`, `Caddyfile.snippet` | wdrożenie |
