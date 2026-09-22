# Eventro — System Marki i UI

**Status:** wersja robocza 1.0 · fundament Etapu UI/UX
**Źródło:** brief brandingowy (ChatGPT) + weryfikacja wdrożeniowa i dostępności (Claude)
**Do czego służy:** jedno źródło prawdy dla przełożenia marki Eventro na kod aplikacji. Sekcje 3–6 to gotowe tokeny i reguły do wklejenia przez Codeksa. Sekcje 9–11 to plan pracy.

---

## 1. Nazwa i logo

- **Nazwa:** Eventro (klepnięta).
- **Logo:** kierunek „Connected E" — litera **E** zbudowana z 3 węzłów połączonych liniami (ludzie → punkty, networking → połączenie). Sprawdza się jako mała ikona (favicon, ikona aplikacji, awatar) — to był główny powód wyboru tego wariantu.
- **Wordmark:** „Eventro" (z wielkiej litery — tak jak na finalnych wizualizacjach), Manrope SemiBold.
- **Architektura:** `[symbol] Eventro` (pełne) oraz `[symbol]` (kompaktowe, np. w nagłówku panelu i jako favicon). Bez descriptorów typu „event networking platform" w samym logo.
- **Pliki:** obraz z generatora to KIERUNEK, nie plik produkcyjny. Do wdrożenia potrzebny czysty **SVG** (odtworzymy symbol jako wektor w pierwszym zadaniu Etapu UI/UX).

## 2. Hasło

- **Główne (PL) — ZATWIERDZONE:** „Wydarzenia zaczynają się od ludzi."
- **EN (materiały międzynarodowe):** „Turn events into connections."
- Alternatywy z wizualizacji („Więcej niż wydarzenia", „Wydarzenia, które łączą ludzi") — trzymamy jako komunikacyjne, nie jako główne hasło marki.

---

## 3. Paleta kolorów (design tokens)

Rola kolorów: **Indigo = interfejs/zaufanie**, **Aqua = networking/sukces**, **Coral = grywalizacja/akcent** (przyprawa, nie baza).

### Tryb jasny (light)

| Rola | Nazwa | HEX |
|---|---|---|
| Główny | Eventro Indigo | `#5146E5` |
| Główny (hover/dark) | Deep Indigo | `#3930B8` |
| Pomocniczy | Connect Aqua | `#18B8A5` |
| Akcent | Human Coral | `#FF6B5E` |
| Tło aplikacji | Cloud | `#F7F8FC` |
| Powierzchnia (karty) | Pure White | `#FFFFFF` |
| Tekst główny | Midnight | `#171A2B` |
| Tekst drugorzędny | Slate | `#606579` |
| Linie / obramowania | Mist | `#E4E6EF` |

### Tryb ciemny (dark)

| Rola | HEX |
|---|---|
| Tło | `#10111A` |
| Powierzchnia | `#181A26` |
| Powierzchnia podniesiona | `#202231` |
| Tekst główny | `#F5F6FA` |
| Tekst drugorzędny | `#A8ACBC` |
| Obramowania | `#303343` |
| Główny (Indigo) | `#8179FF` |
| Aqua | `#45D4C2` |
| Coral | `#FF8278` |

### Gotowe zmienne CSS (do `globals.css`)

> Codex dopasuje nazwy do istniejącej struktury shadcn (`--primary`, `--background`, `--foreground`, …). Poniżej wartości źródłowe.

```css
:root {
  --eventro-indigo: #5146E5;
  --eventro-indigo-strong: #3930B8;
  --eventro-aqua: #18B8A5;
  --eventro-coral: #FF6B5E;

  --bg: #F7F8FC;
  --surface: #FFFFFF;
  --text: #171A2B;
  --text-muted: #606579;
  --border: #E4E6EF;

  /* tekst NA kolorach markowych — patrz reguły w sekcji 5 */
  --on-indigo: #FFFFFF;   /* biały tekst na indigo — OK */
  --on-coral: #171A2B;    /* CIEMNY tekst na coralu — biały NIE przechodzi */
  --on-aqua: #171A2B;     /* ciemny tekst na aqua */
}

:root[data-theme="dark"], .dark {
  --eventro-indigo: #8179FF;
  --eventro-aqua: #45D4C2;
  --eventro-coral: #FF8278;

  --bg: #10111A;
  --surface: #181A26;
  --surface-raised: #202231;
  --text: #F5F6FA;
  --text-muted: #A8ACBC;
  --border: #303343;
}
```

### Rozszerzenie Tailwind (`tailwind.config`)

```js
theme: {
  extend: {
    colors: {
      indigo:  { DEFAULT: '#5146E5', strong: '#3930B8' },
      aqua:    '#18B8A5',
      coral:   '#FF6B5E',
      cloud:   '#F7F8FC',
      midnight:'#171A2B',
      slate2:  '#606579',
      mist:    '#E4E6EF',
    },
  },
}
```

---

## 4. Typografia

- **Nagłówki: Manrope** (Google Fonts) — H1/H2 700, H3 600, przyciski 600.
- **Tekst / UI: Inter** (Google Fonts) — tekst 400, label/UI 500, dane/liczby 600.
- **Ładowanie:** oba z Google Fonts (aplikacja jest webowa). W Next: `next/font/google` dla Manrope i Inter, przypięte jako zmienne CSS `--font-manrope`, `--font-inter`.

Skala (desktop → mobile):

| Element | Font / waga | Rozmiar | Line-height |
|---|---|---|---|
| H1 | Manrope 700 | 56px → 36–40px | 1.08 |
| H2 | Manrope 700 | 40px | 1.15 |
| H3 | Manrope 600 | 28px | 1.2 |
| Body Large | Inter 400 | 18px | 1.5 |
| Body | Inter 400 | 16px | 1.5 |
| UI / label | Inter 500 | 14px | 1.4 |
| Caption | Inter 500 | 12px | 1.4 |
| Liczby / dane | Inter 600 | wg kontekstu | — |

---

## 5. Reguły użycia (dostępność — WCAG AA)

Zweryfikowane kontrasty — **przestrzegać przy wdrożeniu**:

1. ✅ **Indigo `#5146E5` + biały tekst** (przyciski, CTA) — ~6.5:1, OK.
2. ✅ **Midnight na Cloud/białym** — ~16:1; **Slate `#606579` na białym** — ~5.8:1, OK dla tekstu.
3. ⚠️ **Coral z BIAŁYM tekstem — ZAKAZ.** `#FF6B5E` + biały = ~2.8:1, nie przechodzi. Elementy coralowe (np. „+50 pkt", odznaki nagród) noszą **ciemny tekst (Midnight)** → ~6:1, OK.
4. ⚠️ **Aqua i Coral nie jako kolor fontu na białym** (za jasne). Działają jako **powierzchnie, ikony, większe elementy UI** — nie jako drobny tekst.
5. **Tryb ciemny:** używać rozjaśnionych wariantów (Indigo `#8179FF`, Aqua `#45D4C2`, Coral `#FF8278`) — źródłowe kolory są za ciemne na ciemnym tle.
6. **Coral to akcent, nie baza** — tylko grywalizacja, nagrody, highlighty. Nie robić z niego drugiego koloru interfejsu.

---

## 6. Motyw przewodni „Connection Line"

Sygnatura marki poza logo: prosta linia łącząca dwa punkty (`●───●`, także jako łuk `●──╮ / ●`). Tania w implementacji (SVG/CSS), a robi markę rozpoznawalną nawet bez logo.

Gdzie stosować w naszej aplikacji:
- matchmaking — linia między avatarami dopasowanych osób,
- karty kontaktów i lista uczestników,
- puste stany (empty states) zamiast szarej pustki,
- nagłówki sekcji / landing (subtelne linie łączące bloki).

---

## 7. Tone of voice (skrót)

1. **Technologia niewidoczna** — zero żargonu. Nie „AI-powered matchmaking", tylko „Poznaj osoby, z którymi naprawdę warto porozmawiać."
2. **Konkretnie i krótko** — język działania: Poznaj. Zeskanuj. Połącz się. Zapisz kontakt.
3. **Człowiek przed systemem** — bohaterem jest użytkownik i jego relacje, nie platforma.

Przykłady:
- Powitanie uczestnika: „Cześć, Michał 👋 Zobacz, kogo warto dziś poznać."
- Nagłówek główny: „Więcej rozmów. Więcej wartości z każdego wydarzenia."

---

## 8. Zastosowanie na ekranach (kierunek z wizualizacji)

- **Landing:** dużo bieli (Cloud), Indigo jako główny UI, Aqua w wizualizacji połączeń, Coral tylko punktowo (`+50 pkt`, „Nagroda"). Subtelne Connection Lines między blokami.
- **Panel organizatora:** najbardziej spokojny — ciemny sidebar (`#171A2B`) + bardzo jasny workspace (`#F7F8FC`), karty białe. Indigo dla CTA/wykresów/aktywnej nawigacji. Dużo przestrzeni, bez gradientów na dashboardzie.
- **Ekran uczestnika (mobile):** najbardziej dynamiczny — tu Coral i Aqua mają prawo do energii (grywalizacja, pasek punktów, poziomy).

---

## 9. Decyzje podjęte

1. **Hasło główne:** „Wydarzenia zaczynają się od ludzi." ✅
2. **Poziomy grywalizacji: 4 poziomy** ✅ (zmiana z obecnych 3 w `lib/gamification.ts`):
   - Explorer — 0 pkt
   - Connector — 100 pkt
   - Networker — 250 pkt
   - Ambassador — 500 pkt (najwyższy)

   Wpływ: `computeLevel` (progi + etykiety), teksty „ile do następnego poziomu" na /quests i home, kolejność odznak w rankingu. Realizowane w Zadaniu U1.

## 10. Checklist ekranów do przerobienia (Etap UI/UX)

Mapa istniejącej aplikacji → co zmieniamy (branding, nie funkcje):

- [ ] Fundament: fonty (Manrope+Inter), tokeny kolorów (light+dark), favicon = symbol Eventro, `lib/brand.ts` → nazwa „Eventro"
- [ ] Logo jako SVG (symbol + wordmark, wersja pełna i kompaktowa)
- [ ] Landing / strona marketingowa
- [ ] Panel organizatora — nawigacja, dashboard (statystyki), listy (uczestnicy, partnerzy, questy, nagrody, loteria)
- [ ] Ekran uczestnika — home (wizytówka, pasek punktów), /quests, /ranking, /rewards, profil, kontakty
- [ ] Strona stoiska (booth) i wydruk QR
- [ ] Motyw Connection Line w matchmakingu i pustych stanach
- [ ] Tryb ciemny (jeśli wchodzi w zakres — do decyzji)

## 11. Plan Etapu UI/UX (zadania — jak grywalizacja)

Kolejność od fundamentu do detali, każde zadanie osobno (propozycja → review → wdrożenie → testy):

- **Zadanie U1 — Fundament wizualny:** fonty (Manrope+Inter), tokeny kolorów (light+dark), zmiana marki na Eventro w `lib/brand.ts`, logo SVG + favicon, **rozszerzenie poziomów do 4** (Explorer/Connector/Networker/Ambassador wg sekcji 9). Zero zmian w układzie — tylko żeby cała apka „przeszła" na nowe kolory, font i markę.
- **Zadanie U2 — Panel organizatora:** nawigacja, dashboard, listy i karty wg systemu (ciemny sidebar + jasny workspace, Indigo, dużo przestrzeni).
- **Zadanie U3 — Ekran uczestnika (mobile-first):** home, pasek punktów/poziomy, /quests, /ranking, /rewards — tu Aqua/Coral i energia grywalizacji.
- **Zadanie U4 — Landing / strona marketingowa** wg key visualu.
- **Zadanie U5 — Detale i spójność:** stany ładowania/puste/błędy, Connection Line, mikrointerakcje (pasek postępu, „+X pkt"), przegląd dostępności.

---

## 12. Panel uczestnika v2 — kierunek wizualny (wizualizacje GPT, wrz 2026)

Bazuje na 7 wizualizacjach wygenerowanych przez GPT (Loteria, Nagrody, Questy, Partnerzy, Uczestnicy, Agenda, Prelegenci). GPT nie znał zawartości sekcji, więc dorysował część funkcji — poniżej rozdzielone od tego, co realnie mamy.

### Decyzje
1. **Platforma: mobile-first, styl w górę.** Zostajemy przy mobile-first (event = telefon), a język wizualny z wizek przenosimy na mobile i lekko na desktop. NIE przechodzimy na desktop-first. Desktop = warstwa „przeglądanie przed wydarzeniem".
2. **Kolejność: najpierw domknąć U2 (panel organizatora), potem osobny trak „Uczestnik v2".**

### Język wizualny do przeniesienia (z wizek)
- **Hero sekcji:** duży nagłówek dwukolorowy (Midnight + Indigo), podtytuł, zdjęcie osoby w organicznym kształcie + **Connection Line** (pływające gradientowe kule niebiesko-turkusowo-koralowe + łuki linii). Sygnatura „LUDZIE · KONTAKTY · DOŚWIADCZENIA".
- **Karty:** białe, miękkie cienie, duże zaokrąglenia; odznaki narożne (Najpopularniejsze / Nowość / Premium / Bestseller); ikona zakładki (bookmark) w rogu.
- **Widgety w sidebarze:** Twój poziom (donut + pasek), Twoje szanse / progres, „Jak zdobyć więcej…", listy (ostatni zwycięzcy / odbiory, TOP uczestników). Na mobile → sekcje jedna pod drugą (nie kolumna boczna).
- **Paski filtrów:** pigułki kategorii + wyszukiwarka + sortowanie.
- **Coral/Aqua z prawem do energii** (grywalizacja) — zgodnie z sekcją 8.

### Mapa: wizka → stan realny → nowe funkcje → koszt
| Sekcja | Mamy? | Nowe (funkcja, nie tylko styl) | Koszt |
|---|---|---|---|
| Nagrody | ✅ katalog, punkty, odbiór, historia | kategorie, stan „Brakuje X pkt", karta podarunkowa (realna wartość → temat prawny) | niski (reskin) |
| Prelegenci | ✅ | ~1:1 | niski |
| Agenda | ✅ sesje, sceny | „Dodaj do mojego planu", filtry formatów | niski/średni |
| Questy | ✅ questy, kategorie, punkty, QR, ranking | quest-quiz, stan „W trakcie", donut postępu | średni |
| Partnerzy | ✅ partnerzy, stoiska, wizyty | poziomy (Sponsor gł./Partner/Wystawca), Strefy tematyczne | średni |
| Uczestnicy | ✅ lista + matchmaking (powód + pytanie) | % dopasowania, „Umów rozmowę" (kalendarz spotkań), status dostępności, cytat os. | wysoki |
| Loteria | ⚠️ tylko losowanie po stronie organizatora | system „losów" (bilety za aktywność), zapisy per-nagroda, odliczanie, ostatni zwycięzcy | wysoki (inny model) |

### Kolejność wewnątrz traku (rekomendacja)
Najpierw tanie i wartościowe reskiny: **Nagrody → Prelegenci → Agenda → Questy**, potem **Partnerzy**, na końcu decyzje funkcjonalne: **Uczestnicy** (% match, spotkania) i **Loteria** (model losów).

### Logo (kierunek z wizek)
Wizki pokazują kolorowe **„Connected E"** (gradient niebiesko-turkusowo-koralowy) + wordmark; na gadżetach inny wariant + deskryptor „PEOPLE CONNECT EVENTS". Do **ujednolicenia i wektoryzacji jako finalne logo SVG** (zastępuje placeholder „E" z U1). Uwaga: prawdziwe loga firm na wizkach (ING, Microsoft, Allegro…) to przykłady — u nas dane wprowadza organizator, nie zaszywamy cudzych marek.

### Uwagi produktowo-prawne (przed budową Uczestników/Loterii)
- Nagrody o realnej wartości (np. karta podarunkowa) — decyzja biznesowa/podatkowa.
- „Umów rozmowę" — wymaga modelu spotkań (sloty, zgody, powiadomienia).
- System „losów" — nowy model danych (bilety za aktywność), inny niż obecne losowanie po stronie organizatora.

---

*Dokument roboczy Eventro. Wgraj do repo (obok `Etap2_Partnerzy_Grywalizacja.md`) i poproś Codeksa o `git add` + commit, żeby nie ginął między sesjami.*
