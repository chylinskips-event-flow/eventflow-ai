# Osobna baza Supabase dla Preview

Preview (wdrożenia gałęzi i PR-ów na Vercelu) ma własny projekt Supabase. Dzięki temu testy na Preview
nie zapisują niczego do produkcji. Produkcja nie zmienia się w żaden sposób.

## Stan (24.11.2026)

Osobnej bazy jeszcze nie ma. Supabase pozwala na 2 aktywne darmowe projekty na konto, a oba miejsca
są zajęte (produkcja Eventro i projekt Cyber Box). Do czasu decyzji o planie Pro (ok. 25 USD miesięcznie
za organizację):
- Preview nadal czyta i zapisuje wspólną bazę z produkcją, więc testy na Preview robimy tylko odczytem,
  a testy z zapisem lokalnie (`npm run e2e`, Docker);
- w Vercelu jest ustawione `EMAIL_REDIRECT_TO` tylko dla Preview, więc maile z Preview trafiają na
  jeden adres testowy, a nie do uczestników.

Gdy pojawi się miejsce na projekt (plan Pro albo zwolniony darmowy slot), wystarczy wykonać kroki poniżej.

## Co już jest w repozytorium

- `supabase/migrations/20260619000000_baseline_default_privileges.sql`: przywraca stare uprawnienia
  domyślne, które ma produkcja. Bez tej migracji nowy projekt Supabase zwraca „permission denied” dla
  każdej tabeli. Musi zostać najwcześniejszym plikiem w `supabase/migrations`.
- `supabase/migrations/20261124170000_event_sections_bucket.sql`: zakłada bucket `event-sections`,
  który na produkcji powstał ręcznie.
- `EMAIL_REDIRECT_TO`: na Preview wszystkie maile aplikacji idą na ten jeden adres, a pierwotny
  odbiorca trafia do tematu. Jeśli ta zmienna na Preview nie jest ustawiona, maile nie wychodzą wcale.
  Na produkcji zmienna jest ignorowana.
- Na Preview aplikacja nie zarządza domenami w Vercelu, nawet gdy ma token.
- Lokalne testy E2E działają jak nowy projekt (`auto_expose_new_tables = false`).

## Kroki (jednorazowo)

### 1. Nowy projekt Supabase
1. W panelu Supabase: **New project** w tej samej organizacji, plan Free, region taki jak produkcja.
2. Ustaw hasło bazy i zapisz je w menedżerze haseł.
3. Poczekaj, aż projekt się utworzy.

### 2. Schemat bazy (z komputera, w katalogu projektu)
Wszystkie komendy dotyczą tylko projektu Preview:
```
npx supabase link --project-ref <REF_PROJEKTU_PREVIEW>
npx supabase db push
```
`<REF_PROJEKTU_PREVIEW>` to identyfikator z adresu panelu: `https://supabase.com/dashboard/project/<ref>`.
Komenda zapyta o hasło bazy z kroku 1. `db push` wykona wszystkie migracje po kolei.

**Nigdy nie uruchamiaj `supabase db push` na produkcji.** Produkcja dostaje migracje ręcznie, przez
SQL Editor, więc nie ma historii migracji w CLI. Push próbowałby wykonać wszystko od początku.
Po pracy możesz odłączyć projekt komendą `npx supabase unlink`.

### 3. Logowanie (Supabase → Authentication → URL Configuration)
- **Site URL:** adres dowolnego wdrożenia Preview, np. `https://eventro-git-<gałąź>-my-event-flow.vercel.app`.
  Nie używaj `eventro-git-main-…`: ten adres wskazuje na produkcję (gałąź `main`), nie na Preview.
- **Redirect URLs:** `https://eventro-*-my-event-flow.vercel.app/**`

Link logowania prowadzi na adres, z którego go wysłano (Redirect URLs), więc Site URL to tylko wartość zapasowa.

Maile z linkiem logowania wysyła Supabase. Bez własnego SMTP przychodzą tylko na adresy członków
organizacji Supabase, w limicie kilku na godzinę. Do testów logowania organizatora to wystarczy.

### 4. Zmienne w Vercelu (Settings → Environment Variables, zakres **tylko Preview**)
Ustaw dla Preview osobne wartości:

| Zmienna | Wartość |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | adres projektu Preview (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | klucz `anon` projektu Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | klucz `service_role` projektu Preview |
| `EMAIL_REDIRECT_TO` | Twój adres testowy |

Dla Preview **nie ustawiaj** (albo zostaw tylko w zakresie Production):
- `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`: zarządzanie domenami produkcji;
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `ROOT_DOMAIN` z wartościami produkcyjnymi: linki i kody QR
  prowadziłyby na eventro.pl;
- klucze Stripe `sk_live_…` i produkcyjny sekret webhooka; do testów płatności użyj kluczy testowych.

Zmienne, które dziś są ustawione dla wszystkich środowisk (Production + Preview), trzeba rozdzielić. Dla
Production zostaje obecna wartość, dla Preview ustawiasz osobną albo żadnej.

### 5. Ponowne wdrożenie Preview
W Vercelu otwórz dowolny PR i kliknij **Redeploy** przy wdrożeniu Preview. Możesz też wypchnąć nowy commit.
Zmienne działają dopiero w nowym wdrożeniu.

### 6. Sprawdzenie
1. Wejdź na Preview i zaloguj się linkiem na swój adres. Przejdź onboarding, czyli załóż organizację
   testową, i utwórz wydarzenie testowe.
2. Zarejestruj uczestnika z dowolnym adresem. Mail z biletem powinien przyjść na `EMAIL_REDIRECT_TO`,
   z pierwotnym adresem w temacie.
3. W SQL Editor projektu Preview możesz porównać uprawnienia z produkcją:
   ```sql
   select has_table_privilege('anon', 'public.events', 'SELECT') as anon_events,          -- true
          has_function_privilege('anon', 'public.confirm_paid_order(uuid,text)', 'EXECUTE') as anon_confirm; -- false
   ```

## Ograniczenia
- Projekt Free usypia po 7 dniach bez ruchu. Wybudzasz go jednym kliknięciem w panelu Supabase.
- Crony z `vercel.json` działają tylko na produkcji. Na Preview nie ma automatycznego anulowania zamówień
  ani follow-upu.
- Płatności P24 i Stripe na Preview wymagają kluczy testowych. Webhooki muszą dojść do adresu Preview,
  a ochrona wdrożeń Vercel (Deployment Protection) może je blokować.
- Nowe migracje: po scaleniu PR uruchamiasz je ręcznie na produkcji, jak dotąd. Na Preview wystarczy
  `npx supabase db push` przy podlinkowanym projekcie Preview.
