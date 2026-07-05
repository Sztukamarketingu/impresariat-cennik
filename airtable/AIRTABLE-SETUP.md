# Airtable — przygotowanie bazy

> **STAN 2026-07-05: sekcje A i B WYKONANE przez API** (pola dodane, tabela
> `Zapytania z aplikacji` = `tblqH4QXUVh71TmRH`, zakresy `Cena od`/`Cena do`
> wypełnione automatycznie dla 166 pozycji wg reguły: od = `Cena ich`,
> do = `Cena nasza`; brak naszej → ich + 3000; brak ich → od = nasza; 8 pozycji
> bez żadnej ceny pominięto → pokażą „wycena indywidualna").
>
> **Zostało do zrobienia ręcznie (Tomek):**
> 1. Zaznaczyć `Widoczność w aplikacji` dla artystów, którzy mają iść do aplikacji
>    (na start: ci z `Opis artysty` i zdjęciem; przy duplikatach tylko jeden rekord).
> 2. Przejrzeć/poprawić wyliczone zakresy `Cena od`/`Cena do` (auto-wyliczone można dowolnie zmieniać).
> 3. Opcjonalnie: uzupełnić `Typ wydarzenia` per artysta (puste = artysta widoczny przy każdym typie).
> 4. Opcjonalnie: w tabeli `Zapytania z aplikacji` dodać pole typu **Created time**
>    o nazwie `Data zgłoszenia` (API nie potrafi go utworzyć — 1 klik w UI).

Baza: **app5NIUbshNL31ylr** (ta sama co Cennik 2026 i Imprezy).

## A. Nowe pola w tabeli `Cennik 2026` (tbl0hrhGGQCKMkO8R)

Dodaj pola (Airtable → nagłówek tabeli → „+"):

| Pole | Typ | Po co |
|---|---|---|
| `Cena od` | Number (integer) | dolna granica orientacyjnego zakresu dla organizatora, np. 7000 |
| `Cena do` | Number (integer) | górna granica, np. 10000 → aplikacja pokaże „7 000 – 10 000 zł" |
| `Typ wydarzenia` | Multiple select | do jakich imprez pasuje artysta; opcje DOKŁADNIE: `Impreza plenerowa`, `Impreza firmowa`, `Impreza okolicznościowa`, `Wydarzenie kulturalne`, `Koncert tematyczny` |
| `Widoczność w aplikacji` | Checkbox | tylko zaznaczeni artyści są widoczni w aplikacji |
| `Priorytet` | Number (opcjonalne) | wyżej = wyżej na liście (domyślnie 0) |
| `Opis krótki` | Single line text (opcjonalne) | 1-2 zdania na kafelek; puste → aplikacja skróci `Opis artysty` |

### Zasady wypełniania

- **Zakres cenowy**: wycena od wykonawcy + marża (z reguły +1000–5000 zł). Przykład:
  Kapela Warasy bierze ~7000 → `Cena od` 7000, `Cena do` 10000. Możesz dowolnie
  zawężać/zmieniać — aplikacja pokazuje nowe wartości po max 10 minutach (cache).
- Puste `Cena od`/`Cena do` → aplikacja pokaże szeroki przedział wyliczony z `Cena nasza`
  (np. „10–20 tys. zł"); brak jakiejkolwiek ceny → „wycena indywidualna".
- **Start widoczności**: zaznacz `Widoczność w aplikacji` dla ~11 artystów, którzy mają już
  `Opis artysty` i zdjęcie (z etapu generatora ofert). UWAGA na duplikaty nazw —
  zaznacz TYLKO jeden (najbogatszy) rekord danego artysty; aplikacja i tak deduplikuje,
  ale porządek w bazie się przyda.

## B. Nowa tabela `Zapytania z aplikacji`

Utwórz tabelę o dokładnie tej nazwie, pola:

| Pole | Typ |
|---|---|
| `Data zgłoszenia` | Created time |
| `Firma` | Single line text |
| `Telefon` | Phone number |
| `Email` | Email |
| `Typy wydarzenia` | Multiple select (te same 5 opcji co w Cenniku) |
| `Budżet` | Single select: `do 10 tys. zł`, `do 20 tys. zł`, `do 30 tys. zł`, `do 40 tys. zł`, `do 50 tys. zł`, `budżet nie jest ograniczeniem`, `nie określono` |
| `Style` | Long text |
| `Wybrani artyści` | Long text |
| `Artyści spoza bazy` | Long text (feedback do rozbudowy bazy!) |
| `Data wydarzenia` | Date |
| `Miejscowość` | Single line text |
| `Liczba uczestników` | Single select: `do 200`, `200–500`, `500–2000`, `powyżej 2000` |
| `Rodzaj miejsca` | Single select: `plener`, `sala`, `namiot`, `scena plenerowa` |
| `Wiadomość` | Long text |
| `Deal ID` | Number |
| `Status` | Single select: `Nowe`, `W obsłudze`, `Zamknięte` |

## C. Zdjęcia (Google Drive)

Aplikacja pobiera zdjęcia z linków w polu `Zdjęcie główne` (folder „Zdjęcia do oferty").

1. Sprawdź na 2–3 plikach czy działa publiczny podgląd — otwórz w oknie incognito:
   `https://drive.google.com/thumbnail?id=<ID_PLIKU>&sz=w800`
2. Jeśli obraz się NIE wyświetla → dwie opcje:
   - **prostsza**: udostępnij folder „Zdjęcia do oferty" (`1gLepJSj8g-0lZb9KdcN4mH1iJpqe0hJk`)
     jako „Każdy, kto ma link → Przeglądający",
   - **bez upubliczniania**: po wdrożeniu na VPS uruchamiaj `scripts/sync-photos.sh`
     (pobiera zdjęcia przez gog i wrzuca do cache aplikacji).
3. Brak zdjęcia = elegancki placeholder „zdjęcie wkrótce" — nic się nie psuje.

## Nowe (2026-07-05, runda 4)

- Tabela **Zapytania z aplikacji**: pola `Programy` i `Okazja` dodane przez API — nic do zrobienia.
- **Cennik 2026 → kolumna `Programy`** (multiselect, już istnieje): uzupełnij wartości przy artystach
  z koncertami tematycznymi (np. „Koncert kolęd", „Koncert patriotyczny", „Koncert noworoczny").
  Aplikacja pokazuje krok „Jaki program?" tylko gdy widoczni artyści mają wypełnione programy,
  a filtr pokazuje wyłącznie artystów z danym programem.
