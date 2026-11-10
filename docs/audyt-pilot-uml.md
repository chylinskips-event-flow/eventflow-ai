# Audyt gotowości: pilot dla wydarzeń sektora publicznego (UMŁ / Invest in Łódź)

Etap 0: wyłącznie odczyt kodu z `main` (`b7d5621`, 10.11.2026). Bez zmian w kodzie, bazie, Storage i Vercel.
Test dostępności (axe-core 4.10, WCAG 2.1 A/AA) wykonano na publicznych stronach produkcji
`eventro.pl/e/nextstoplodz` (strona, `/register`, `/wejdz`), wyłącznie oglądając, bez wysyłania formularzy.

Nie scalone, więc **poza `main`**: PR #16 (galeria – uczestnik), #17 (druk B1), #18 (posiłki po QR), #19 (import gości
i wysyłka biletów). Zaznaczam je tam, gdzie zmieniają odpowiedź.

Legenda: **jest** / **częściowo** / **brak** / **do weryfikacji**. Ścieżki względem katalogu repo.

---

## 1. Inwentaryzacja

| # | Wymaganie | Stan | Gdzie | Uwagi |
|---|---|---|---|---|
| 1 | Rejestracja bezpłatna (formularz, zgody, mail) | jest | `src/app/(participant)/e/[slug]/register/*`, `src/lib/email/attendee-confirmation.ts` | Pola: imię*, nazwisko*, e-mail*, firma, stanowisko, branża, zainteresowania, cel. Zgoda RODO wymagana, marketingowa opcjonalna; zapisywana tylko data zgody, bez wersji treści (`register/actions.ts:109-110`). Mail z QR wejścia (inline). Brak double opt-in. |
| 1a | Rejestracja **tylko na zaproszenie** | brak | `src/lib/events.ts:69-83` | Brak tokenu, kodu czy listy zaproszonych. `registration_open` nie ma w UI (tylko w bazie). Jedyne obejście: „Wymagaj zatwierdzenia” + ręczna akceptacja. |
| 1b | Kontrola serwera przy zapisie | **błąd** | `register/actions.ts:69-80`, `checkout/actions.ts:51-58` | Akcja sprawdza tylko istnienie wydarzenia, nie status, `registration_open` ani `deleted_at`. Bezpośrednie wywołanie akcji może zapisać na szkic, zamkniętą lub usuniętą imprezę. Do poprawy przed pilotem. |
| 2 | Zatwierdzanie zgłoszeń | częściowo | `src/app/(organizer)/admin/events/[eventId]/attendees/actions.ts:20-106` | Statusy pending/approved/rejected, maile przy akceptacji i odrzuceniu. **Brak akceptacji zbiorczej.** Lista bez paginacji. Darmowy bilet omija moderację (status `approved` na sztywno, `checkout/actions.ts:117`). |
| 3 | Import CSV zaproszonych + wysyłka imiennego linku | brak na `main` | – | PR #19 dodaje import (Excel/CSV) i zbiorczą wysyłkę biletu z QR. Nie ma w nim zaproszenia z **linkiem rejestracyjnym** (gość od razu jest uczestnikiem). Na `main` jest tylko przycisk testowy „20 uczestników” w Mixerze (`mixer/page.tsx:96`): usunąć przed pilotem. |
| 4 | Panel partnera | jest | `src/app/(partner)/partner/*`, `src/lib/partner-portal.ts` | Konto: zaproszenie mailem (token 14 dni) + logowanie magic linkiem, wiele osób na firmę, cofanie dostępu. Partner: wizytówka i materiały (z akceptacją), wniosek o stoisko, leady (wyłączone flagą, `legalApproved:false`). **Nie widzi uczestników, nie ma zaproszeń, nie ma skanera.** Wymaga planu business/enterprise. |
| 5 | Poziomy partnerstwa | częściowo | `src/lib/partner-options.ts:6-11` | Stała lista w kodzie: Gold, Silver, Bronze, Partner. **Brak Platinum.** Kolejność i kolory zaszyte. Jedyny „benefit” w danych: wyposażenie stoiska wg poziomu (`booth_catalog_items.included_by_tier`). |
| 6 | Check-in QR, identyfikatory, recepcja | jest | `src/lib/reception.ts`, `src/components/qr-scanner.tsx`, `badges/route.ts` | Skaner kamerą, link dla obsługi bez logowania, lista, cofanie. Jeden `checked_in_at` na osobę, bez historii skanów, bez offline, lista nie odświeża się sama. **QR na identyfikatorze PDF to wymiana kontaktów, nie wejście.** Na `main` link recepcji jest na subdomenie, która może nie działać (poprawka w PR #18). |
| 7 | Business Mixer, networking | jest | `src/lib/mixer/*`, `src/lib/matchmaking.ts` | Mixer: rundy i stoły, deterministyczny dobór bez powtórek, prowadzenie na żywo, rzutnik, XLSX. Networking: lista uczestników bez e-maili, prośby o kontakt, e-mail po akceptacji. Uzasadnienia dopasowań generuje Anthropic (`claude-haiku-4-5`), bez wyłącznika per wydarzenie (flaga `ai_support` nieużywana). |
| 8 | Agenda wielu sal, prelegenci, panele | jest | sesje: `track`, `room`, `events.room_names`; `session_speakers` | Wielu prelegentów z rolą speaker/moderator, ostrzeżenie o konflikcie sali. Q&A z głosami, ankiety, oceny, rzutnik `/qa/[token]`, panel prowadzącego `/mod/[token]` (plan business/enterprise). Uczestnik nie filtruje po ścieżce. Brak pojemności i zapisów na sesje. |
| 9 | Strona publiczna `/e/{slug}` | częściowo | `src/app/(participant)/e/[slug]/page.tsx:450-610`, `src/lib/event-sections.ts` | Logo, baner, kolor (z kontrolą kontrastu). Układ stały: baner, nagłówek, „O wydarzeniu”, Prelegenci, Agenda, Partnerzy, sekcje typowane, Rejestracja/Bilety. Sekcje typowane (FAQ, CTA, dojazd, nocleg, galeria, highlights) można włączać i przestawiać, ale tylko w obrębie swojego bloku. Bloków głównych nie da się wyłączyć ani przestawić. |

---

## 2. Luki A–H

### A. Pule zaproszeń partnerów: **brak** (szac. **L, 6–8 dni**)
Nie ma limitu, licznika, wysyłki przez partnera ani powiązania uczestnika z partnerem (`attendees` nie ma `partner_id`).
Kody rabatowe mają `max_uses`, ale działają tylko dla biletów płatnych i mają nieatomowy licznik, więc się nie nadają.

Propozycja:
- Tabela `partner_invite_quotas (partner_id, access_level_id, quota)`: organizator ustala pulę per poziom wejścia (np. 20 konferencja + 6 bankiet), domyślnie z szablonu poziomu partnerstwa.
- Tabela `partner_invitations (id, partner_id, access_level_id, email, imię, nazwisko, token, status invited/registered/declined/revoked, attendee_id)`. Rezerwacja miejsca atomowo w funkcji SQL, licząc `invited + registered` względem puli.
- Zakładka „Zaproszenia” w panelu partnera: licznik „wykorzystano / pozostało”, dodawanie pojedyncze i z CSV (logika z PR #19), wysyłka maila z imiennym linkiem `/e/{slug}/zaproszenie/{token}`. Po wyczerpaniu puli przycisk jest zablokowany.
- Link otwiera formularz z wypełnionymi danymi. Po rejestracji powstaje uczestnik z `partner_id` i uprawnieniami z zaproszenia.
- Wycofanie: niewykorzystane zaproszenie można wycofać i miejsce wraca do puli. Po rejestracji wycofanie wymaga decyzji organizatora (anulowanie uprawnienia, miejsce wraca).
- Odrzucenie przez organizatora (jeśli moderacja włączona) zwalnia miejsce.

Ryzyka: maile wysyłane w imieniu partnera (kto jest administratorem danych gości partnera), nadużycia (limit wysyłek na godzinę), raport per partner. **Wymaga najpierw B.**

### B. Dwa poziomy wejścia w jednym wydarzeniu: **brak** (szac. **M, 4–6 dni**)
Dziś jest jeden znacznik `checked_in_at`, jeden `check_in_token` i jeden link recepcji na wydarzenie. Typ biletu nie niesie uprawnień, a recepcja go nie sprawdza.
Dwa wydarzenia zamiast jednego oznaczają dwa profile, dwa kody QR i dwa maile oraz osobne raporty. Dlatego rekomenduję jedno wydarzenie.

Propozycja:
- `event_access_levels (id, event_id, nazwa, pojemność, kolejność)`, np. „Konferencja”, „Bankiet”.
- `attendee_access (attendee_id, access_level_id, granted_by, checked_in_at, checked_in_by)` z unikalną parą.
- **Jeden kod QR na osobę.** Punkt kontroli (recepcja konferencji, wejście na bankiet) to osobny link obsługi przypisany do poziomu. Skan odpowiada „Wejście / Już wszedł o 18:02 / Brak uprawnienia do bankietu”.
- Wzorzec jest gotowy w PR #18 (posiłki: osobny link obsługi, jedno wydanie na osobę, unikalny indeks, CSV). Wystarczy dodać listę uprawnionych i pojemność.
- Pojemność pilnowana atomowo przy nadawaniu uprawnienia.
- Uczestnik: jeden profil, jeden mail z QR i listą uprawnień.
- Raporty: frekwencja per poziom, per partner.

Ryzyka: migracja istniejącego `checked_in_at` (konferencja = poziom domyślny), identyfikatory z oznaczeniem bankietu.

### C. Wersja angielska: **brak** (szac. **L, 8–12 dni** + tłumaczenie i przegląd prawny dokumentów)
Nie ma infrastruktury i18n.
- `lang="pl"` jest na sztywno w `src/app/layout.tsx:35` i w mailach (`attendee-layout.ts:65`).
- Brak kolumny języka na wydarzeniu i uczestniku.
- ~200 plików z tekstem po polsku, daty `pl-PL`, polskie ścieżki URL (`/wejdz`, `/recepcja`).

Organizator może dziś nadpisać treść 6 szablonów maili per wydarzenie, ale w trybie strukturalnym przycisk i link zapasowy zostają po polsku. Pełny mail EN wymaga trybu HTML.
Zawsze po polsku zostają: mail „Wejdź ponownie”, zaproszenie partnera, maile stoiskowe, follow-up i regulamin/polityka.

Propozycja (zakres pilota: strona publiczna, formularz, maile, panel uczestnika; panel organizatora i partnera bez zmian):
- Słowniki pl/en i `events.languages`.
- `attendees.locale` zapisywany przy rejestracji z przełącznika PL/EN na stronie.
- Szablony maili per język.
- Daty przez `Intl` z locale.
- Regulamin i polityka EN.

Ryzyka: tłumaczenie dokumentów prawnych, treści organizatora (opisy, agenda) w dwóch językach. To osobne pola, co dodaje około 2–3 dni.

### D. Własny adres (`tech4life.lodz.pl`): **brak** (szac. pilot ręczny **S–M, 2–4 dni**; alternatywa **0 dni**)
Dziś obsługiwane są tylko subdomeny `{slug}.{ROOT_DOMAIN}`:
- `middleware.ts:4,19-36`: host musi kończyć się na `.eventro.pl`.
- `src/lib/vercel-domains.ts`: dodawanie, usuwanie i sprawdzanie w Vercel; host zawsze z `slug`.
- Brak kolumny na domenę w bazie. Flagi `custom_domain` i `white_label` istnieją tylko w planach, kod ich nie używa.

Zmienne `ROOT_DOMAIN` (serwer) i `NEXT_PUBLIC_ROOT_DOMAIN` (bundle) mogą się rozjechać.

Najprostsze dla pilota: klient ustawia na `tech4life.lodz.pl` **przekierowanie 301** na `eventro.pl/e/{slug}`. Zero zmian w kodzie i bez ryzyk niżej. Wada: w pasku adresu widać `eventro.pl`.

Pełna obsługa obcej domeny:
1. Klient: rekord CNAME `tech4life` → `cname.vercel-dns.com`. Do weryfikacji, czy ich DNS na to pozwala.
2. Vercel: ręczne dodanie domeny do projektu i weryfikacja certyfikatu.
3. Baza: tabela `event_domains (host, event_id)`, wpis ręczny.
4. Kod:
   - middleware mapuje host z tabeli na `/e/{slug}`;
   - linki w mailach, QR, canonical i powrót z płatności z adresu wydarzenia, nie z `NEXT_PUBLIC_ROOT_DOMAIN`, który jest wspólny dla całego bundla (`src/lib/event-url.ts:16-22`, `badges/route.ts:13`);
   - blokada `/admin` i `/partner` na obcym hoście.

Ryzyka logowania:
- Ciasteczko uczestnika jest per host (`eventflow_attendee_token`, bez atrybutu `domain`). Sesja z `eventro.pl` nie przejdzie na obcą domenę, więc linki z maili muszą prowadzić na tę samą domenę.
- Uczestnik nie używa Supabase Auth, więc allowlisty to nie dotyczy. Organizator i partner logują się magic linkiem z `emailRedirectTo` z nagłówków żądania (`src/lib/request-origin.ts`). Powinni zostać na `eventro.pl`, inaczej obcy host trzeba dopisać do Redirect URLs w Supabase.
- `getOrigin` ufa nagłówkom `Host`/`x-forwarded-host`.
- Nadawca maili, Reply-To `kontakt@eventro.pl` (`src/lib/email/config.ts:32`) i stopka maila mają markę Eventro.

### E. Dostępność (WCAG 2.1 AA): **częściowo**, wyniki w p. 3

### F. Wydarzenie bezpłatne: **jest**
- Bez typów biletów działa `/register` bez P24 i Stripe. Darmowy bilet przechodzi przez `completeFreeCheckout` bez płatności (`checkout/actions.ts:26-214`).
- Klucze P24 i Stripe są czytane leniwie, dopiero przy płatności. Stripe dotyczy tylko abonamentu organizatora.
- Wymagane: Supabase i Resend (`RESEND_API_KEY`, `RESEND_FROM`). Build bez kluczy płatniczych: do weryfikacji (nie uruchamiano).
- Efekt uboczny: darmowe zamówienie ma `status='paid'`, więc blokuje usunięcie wydarzenia (`orders.ts:3-11`, `actions.ts:322-330`). Do poprawy.
- Faktury i NIP dla uczestników: brak. Kolumna `orders.invoice_data` jest, ale nic jej nie zapisuje.

### G. Raporty dla urzędu: **częściowo** (szac. **S–M, 2–3 dni** po A i B)
Jest:
- CSV leadów partnera;
- CSV logistyki stoisk;
- XLSX Mixera;
- PDF identyfikatorów;
- licznik obecnych na ekranie recepcji;
- liczba wizyt i leadów per partner, tylko na ekranie.

Brak:
- **eksportu listy uczestników** (CSV/XLSX ze statusem, firmą i godziną check-inu);
- frekwencji do pliku;
- zaproszeń wg partnera i poziomu;
- zestawienia do rozliczenia projektu.

W PR #18 jest CSV wydanych posiłków. Uwaga: CSV leadów u organizatora nie zabezpiecza formuł Excela (brak `csvSafe`).

### H. Dane i RODO: stan faktyczny z kodu
**Podprocesorzy widoczni w kodzie**
- Supabase: baza, Auth, Storage.
- Vercel: hosting i crony.
- Resend: wszystkie maile.
- Anthropic: dopasowania networkingu. Wysyłane są imię, nazwisko, firma, stanowisko, branża, zainteresowania, cel i „czego szukam”, bez e-maila (`src/lib/matchmaking.ts:190-206`).
- Stripe: abonament organizatora.
- Przelewy24: bilety płatne; przekazywany e-mail kupującego.

Brak analityki i zewnętrznych skryptów. Fonty Google są pobierane przy buildzie i serwowane z naszej domeny.

**Regiony: do weryfikacji w panelach.** Region Supabase i Vercel nie wynika z kodu (`vercel.json` bez `regions`). Region Resend i transfer do USA (Anthropic, Vercel, Resend) też trzeba potwierdzić.

**Polityka prywatności** (`src/app/privacy/page.tsx:177-207`) wymienia Supabase, Vercel, Resend i Anthropic. Pomija Stripe i Przelewy24.

**Storage**
- Publiczne buckety: logo wydarzeń, zdjęcia prelegentów, treści, **awatary uczestników**, logo partnerów, nagrody.
- Prywatne: materiały partnerów, zdjęcia z eventu.

**Retencja**
- Brak automatycznego usuwania danych uczestników. Po wydarzeniu dane zostają bezterminowo.
- Usunięcie wydarzenia jest tylko „miękkie” (`deleted_at`), dane uczestników zostają.
- Crony: follow-up po wydarzeniu i anulowanie nieopłaconych zamówień. Niczego nie kasują.

**Usuwanie uczestnika** (samodzielnie w profilu albo przez organizatora, `src/lib/attendee-deletion.ts`)
- Kasuje rekord kaskadowo razem z awatarem.
- **Zostają** imię, nazwisko i e-mail w `tickets.holder_*` i `orders.buyer_*` (darmowy bilet też tworzy zamówienie).

**Logi**
- Adres e-mail w logu crona (`api/cron/post-event-followup/route.ts:65`).
- **Token wejściowy uczestnika** w logu wydawania nagród, pozostałość po debugowaniu (`rewards/actions.ts:294`).
- E-mail w URL po darmowym bilecie (`checkout/actions.ts:209-213`), imię w `/welcome?name=`. Może trafiać do logów hostingu.
- Pełne obiekty błędów Resend: do weryfikacji, czy zawierają adresata.

**Sesja uczestnika**
- Ciasteczko z tokenem dostępu ważnym bezterminowo ma `httpOnly:false` (`register/actions.ts:149`, `a/[token]/route.ts:41`, `checkout/actions.ts:202`).
- Kod przeglądarki go nie czyta, więc można je przestawić na `httpOnly:true`.

---

## 3. Dostępność: wyniki pomiaru i przeglądu kodu

Automatycznie (axe-core, WCAG 2.1 A/AA):
- strona wydarzenia: **1 naruszenie**;
- `/register`: 0;
- `/wejdz`: 0.

Szerokość 320 px bez przewijania w poziomie. Obrazy mają `alt`, `lang="pl"` jest ustawiony.
Axe nie wykrywa większości problemów z formularzy i semantyki, więc poniżej są też ustalenia z kodu.
**Nie zmierzono:** panelu uczestnika (wymaga zalogowania), skanera, Mixera, rzutnika, panelu organizatora. Brak testu czytnikiem ekranu (NVDA) i samą klawiaturą.

| Priorytet | Naruszenie | Kryterium | Gdzie | Nakład |
|---|---|---|---|---|
| Wysoki | Kontrast 3,01:1 (pomarańczowy tekst 12 px na jasnym tle) | 1.4.3 | strona wydarzenia, `.text-amber-600` w kartach (bilety) | 0,5 dnia |
| Wysoki | Błędy formularza bez `role="alert"`/`aria-live`, pola bez `aria-invalid`/`aria-describedby` | 3.3.1, 4.1.3 | `register-form.tsx:227` i inne formularze uczestnika | 1 dzień |
| Wysoki | Brak `autocomplete` (given-name, family-name, email, organization) | 1.3.5 | formularz rejestracji, `/wejdz` | 0,5 dnia |
| Średni | Chipy zainteresowań bez `aria-pressed`, grupa bez `fieldset`/`legend` | 4.1.2, 1.3.1 | `register-form.tsx:145-165` | 0,5 dnia |
| Średni | Hierarchia nagłówków: dzień agendy jako H2 pod H2 „Agenda” | 1.3.1 | strona wydarzenia | 0,5 dnia |
| Średni | Brak linku „Przejdź do treści” | 2.4.1 | `src/app/layout.tsx` | 0,5 dnia |
| Średni | Mail: stopka #9ca3af na #f3f4f6 (kontrast 2,31:1), `lang="pl"` także dla treści EN | 1.4.3, 3.1.1 | `src/lib/email/attendee-layout.ts:65,87` | 0,5 dnia |
| Średni | Odświeżanie co 5–15 s (Q&A, Mixer, rzutnik): czy czytnik ekranu ogłasza zmiany | 4.1.3 | do weryfikacji | 1 dzień |
| Niski | Brak obsługi `prefers-reduced-motion` (0 wystąpień) | 2.3.3 (AAA) | globalnie | 0,5 dnia |
| Do weryfikacji | Panel uczestnika, dolna nawigacja, okna dialogowe, skaner, kontrast w trybie ciemnym i przy kolorze organizatora | różne | – | audyt ręczny 1–2 dni |

Mocne strony: komponenty Radix (checkbox, select, dialog) mają poprawne role i etykiety. Pola mają `<label>`, focus jest widoczny (`focus-visible:ring`). Kolor organizatora przechodzi kontrolę kontrastu (`src/lib/event-theme.ts`). QR w mailu ma `alt`, tabele układu mają `role="presentation"`.

Razem przed pilotem: **3–5 dni** poprawek i 1–2 dni audytu ręcznego.
Podmiot publiczny musi też opublikować **deklarację dostępności**. Dotyczy strony wydarzenia, jeśli jest „ich” stroną: do decyzji prawnika.

---

## 4. Rekomendowana kolejność

**Obowiązkowe przed pilotem**
1. Poprawki bezpieczeństwa i porządku (S, 1–2 dni):
   - kontrola statusu i `registration_open` w akcjach rejestracji i darmowego biletu;
   - usunięcie przycisku testowego z Mixera;
   - usunięcie logu tokenu i adresu e-mail;
   - bez e-maila w URL;
   - `httpOnly:true`;
   - darmowe zamówienia nie blokują usunięcia wydarzenia.
2. Scalenie PR #18 (posiłki, poprawka skanera i linku recepcji) i #19 (import i wysyłka biletów).
3. **B: poziomy wejścia** (M, 4–6 dni), oparte na wzorcu z PR #18.
4. **Rejestracja tylko na zaproszenie** (S–M, 2–3 dni):
   - tryb wydarzenia „zamknięte”, w którym `/register` przyjmuje tylko imienny token;
   - zaproszenie z linkiem z PR #19;
   - przełącznik `registration_open` w UI.
5. **A: pule zaproszeń partnerów** (L, 6–8 dni) oraz poziom Platinum (S, 0,5 dnia).
6. **E: dostępność** (3–5 dni + audyt ręczny).
7. **G: eksport uczestników i frekwencji** (S–M, 2–3 dni).
8. **C: wersja angielska** (L, 8–12 dni). Obowiązkowa, jeśli Tech4Life ma gości anglojęzycznych od pierwszej edycji.

**Może poczekać**
- D w pełnej wersji (na start przekierowanie 301);
- akceptacja zbiorcza;
- konfiguracja kolejności bloków strony (opcja do wyceny: włączanie i kolejność bloków, własne teksty; ok. 2–3 dni, bez edytora drag-and-drop);
- skaner po stronie partnera;
- offline recepcji;
- faktury.

Łącznie obowiązkowe pkt 1–7: około **20–30 dni roboczych**; z wersją EN około **30–40**.

**Pytania do właściciela**
1. Data pierwszego wydarzenia i czy od razu PL/EN?
2. Bankiet: osobna lista od organizatora, z puli partnerów, czy jedno i drugie? Czy bankiet wymaga wcześniejszego wejścia na konferencję?
3. Czy zaproszony gość ma się jeszcze zarejestrować (formularz ze zgodami), czy organizator lub partner wpisuje go od razu?
4. Czy partner może zaprosić osobę spoza swojej firmy? Czy organizator akceptuje zaproszenia partnerów?
5. Adres: wystarczy przekierowanie z `tech4life.lodz.pl`, czy adres ma zostać w pasku?
6. Czy dopasowania AI (Anthropic) mają być wyłączone dla klienta publicznego? Wymaga to dodania wyłącznika per wydarzenie, bo flaga `ai_support` nie jest dziś używana.
7. Nadawca i Reply-To maili: Eventro czy adres urzędu (wymaga weryfikacji domeny w Resend)?
8. Jakich raportów urząd wymaga do rozliczenia projektu (wzór)?
9. Plan klienta: panel partnera i Q&A wymagają planu business/enterprise.

---

## 5. Do decyzji prawnika lub zmian w dokumentach
1. **Umowa powierzenia:** lista podprocesorów, potwierdzone regiony (Supabase, Vercel, Resend) i podstawa transferu poza EOG (Anthropic, Vercel, Resend), m.in. SCC lub DPF.
2. **Polityka prywatności:**
   - dopisać Stripe i Przelewy24;
   - opisać zaproszenia od partnerów (kto jest administratorem danych gości wpisanych przez partnera);
   - opisać import list przez organizatora (podstawa przetwarzania bez zgody gościa, PR #19);
   - dodać wersję EN.
3. **Retencja:** wskazać okres przechowywania po wydarzeniu i wdrożyć automatyczne usuwanie lub anonimizację (dziś brak). Ustalić, czy dane biletów i zamówień mają przetrwać usunięcie konta.
4. **Zgody:** zapisywać wersję treści zgody przy rejestracji (dziś tylko data); zgoda na publiczny awatar (bucket publiczny).
5. **AI w networkingu:** czy profilowanie i uzasadnienia przez model zewnętrzny wymagają odrębnej informacji lub zgody, lub wyłączenia dla sektora publicznego.
6. **Leady partnerów:** zatwierdzenie treści zgody `draft-2026-10` przed włączeniem (`legalApproved`).
7. **Deklaracja dostępności** i zgodność z ustawą o dostępności cyfrowej: po czyjej stronie (urząd czy dostawca).
8. **Regulamin:** wersja EN, rola Eventro jako dostawcy dla jednostki publicznej, maile w imieniu urzędu i partnerów.
