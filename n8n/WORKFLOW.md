# Workflow n8n — „Zapytania z aplikacji"

Przyjmuje zapytanie z aplikacji (POST z backendu), zapisuje w Airtable, tworzy deal w Bitrix
(lejek organizatora) i budzi Anatola hookiem.

## Graf węzłów

```
[Webhook POST /webhook/zapytania-app]
  → [Code: auth X-Inquiry-Token + walidacja + normalizacja + TITLE/COMMENTS bez emoji]
  → [IF poprawne]
      ├─ NIE → [Respond 403/400]
      └─ TAK → [Airtable: create "Zapytania z aplikacji"]
               → [HTTP: crm.duplicate.findbycomm type=EMAIL entity_type=CONTACT]
               → [IF kontakt istnieje]
                   ├─ TAK → [Set contactId = CONTACT[0]]
                   └─ NIE → [HTTP: crm.contact.add] → [Set contactId = result]
               → [HTTP: crm.deal.add {TITLE, CATEGORY_ID:9, STAGE_ID:"C9:NEW",
                                      ASSIGNED_BY_ID:19, CONTACT_ID, SOURCE_ID:"WEB", COMMENTS}]
               → [HTTP: crm.deal.get — weryfikacja że COMMENTS niepuste (pułapka emoji)]
               → [HTTP: hook Anatola http://172.18.0.10:18790/hooks/agent (onError: continue)]
               → [Respond 200 {ok:true, dealId}]
```

## Import i konfiguracja

1. n8n → Workflows → Import from file → `workflow-zapytania.json`.
2. Węzeł **Airtable: zapis zapytania** — wybierz istniejący credential Airtable
   (ten sam, którego używają inne workflow OC). Tabela `Zapytania z aplikacji` musi
   istnieć (patrz `airtable/AIRTABLE-SETUP.md`).
3. Zmienne środowiskowe n8n (env serwisu n8n w docker compose, potem `docker compose up -d n8n`):
   - `INQUIRY_SHARED_TOKEN` — ta sama wartość co w aplikacji (auth webhooka),
   - `BITRIX24_REST_URL_ANATOL` — REST Anatola (rest/19), bez trailing slash,
   - `HOOKS_TOKEN` — Bearer do hooks-proxy (port 18790).
4. Testuj najpierw przez **webhook testowy** (Execute workflow → URL `/webhook-test/zapytania-app`),
   dopiero po weryfikacji aktywuj workflow (URL produkcyjny `/webhook/zapytania-app`).

## Kluczowe zasady (nie zmieniać bez powodu)

- **Zero emoji w TITLE/COMMENTS** — Bitrix zwraca `result:true`, ale po cichu NIE zapisuje pola.
  Strip jest podwójny (aplikacja + węzeł Code); węzeł weryfikacji `crm.deal.get` łapie regres.
- **TITLE** musi pasować do regexa generatora ofert:
  `Organizator: {miasto} {DD.MM.YYYY} — {gatunek} ({nazwa})` — data w formacie `DD.MM.YYYY`.
- **Hook do Anatola ma `onError: continue`** — padnięty hook nie może zgubić zapytania
  (dane są już w Airtable i Bitrix). Po awarii hooks-proxy patrz CLAUDE.md (restart hooks-proxy).
- Kontakt dopasowywany **po mailu** (`crm.duplicate.findbycomm`) — pewny klucz to mail,
  nie zapisane ID (patrz pamięć: cennik-bitrix-id-niepewne).

## Test end-to-end (Faza C)

```bash
curl -s -X POST 'https://<n8n>/webhook-test/zapytania-app' \
  -H 'Content-Type: application/json' \
  -H "X-Inquiry-Token: $INQUIRY_SHARED_TOKEN" \
  -d '{"organizer":{"company":"TEST Urzad","phone":"+48 601 234 567","email":"test@example.pl"},
       "eventTypes":["Impreza plenerowa"],"budget":"do 30 tys. zł","styles":["Disco Polo"],
       "artists":[{"name":"Zespol Testowy","priceLabel":"12 000 – 16 000 zł"}],
       "customArtists":[],"event":{"date":"2026-09-12","city":"Kobiór","attendance":"500–2000","venueType":"plener"},
       "message":"Zgloszenie testowe - do usuniecia"}'
```

Sprawdź: rekord w `Zapytania z aplikacji`; `crm.deal.get id={dealId}` → `CATEGORY_ID=9`,
`STAGE_ID=C9:NEW`, `ASSIGNED_BY_ID=19`, **`COMMENTS` niepuste**; log openclaw — hook dotarł.
Deal testowy oznacz TEST i usuń.
