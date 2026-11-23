-- ════════════════════════════════════════════════════════════════════════════
-- Eventro — korekta dat sprzedaży biletów i ważności kodów zapisanych przed wdrożeniem
-- interpretacji pól datetime-local w strefie wydarzenia (2026-11-23)
--
-- NIE jest migracją (katalog supabase/cleanup/) — nie wykona się automatycznie. Opcjonalne:
-- uruchamia właściciel ręcznie w Supabase → SQL Editor, po przejrzeniu wyników podglądu.
-- Domyślnie kończy się ROLLBACK (przebieg „na sucho”). Żeby zapisać zmiany, właściciel świadomie
-- zamienia na końcu ROLLBACK na COMMIT.
--
-- NOTATKA WDROŻENIOWA
-- Przed wdrożeniem godziny wpisane w panelu biletów (sprzedaż od/do, ważność kodu rabatowego)
-- trafiały do kolumn timestamptz bez strefy, więc baza traktowała je jak UTC. Po wdrożeniu panel
-- pokazuje je w strefie wydarzenia (domyślnie Europe/Warsaw), np. wpisane 10:00 widać jako 11:00
-- (zimą) albo 12:00 (latem), i o tyle później otwiera/zamyka sprzedaż i ważność kodu.
-- Nowo zapisywane wartości są już poprawne. Istniejące niepuste wartości trzeba przejrzeć:
--   ticket_types.sales_start, ticket_types.sales_end,
--   discount_codes.valid_from, discount_codes.valid_until.
-- Alternatywa dla tego skryptu: organizator otwiera edycję biletu/kodu, poprawia godziny
-- i zapisuje (zapis po wdrożeniu jest interpretowany poprawnie).
--
-- Skrypt reinterpretuje zapisany „czas zegarowy UTC” jako czas w strefie wydarzenia
-- (events.timezone, domyślnie Europe/Warsaw). Dotyczy wyłącznie wierszy utworzonych przed
-- momentem wdrożenia — ustaw v_deployed_at poniżej. UWAGA: wiersz utworzony przed wdrożeniem,
-- ale którego daty organizator zapisał ponownie PO wdrożeniu, jest już poprawny i nie może być
-- przesunięty drugi raz (updated_at nie pomaga, bo zmienia się też przy sprzedaży/użyciu kodu).
-- Takie wiersze wyklucz, wpisując ich id do excluded_ids. Każdy wiersz zmieniaj tylko raz.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Moment wdrożenia (UTC) oraz wiersze do pominięcia — UZUPEŁNIJ przed uruchomieniem.
CREATE TEMP TABLE fix_params ON COMMIT DROP AS
SELECT timestamptz '2099-01-01 00:00:00+00' AS deployed_at;  -- ← zamień na faktyczny czas wdrożenia

CREATE TEMP TABLE excluded_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
-- INSERT INTO excluded_ids VALUES ('00000000-0000-0000-0000-000000000000');

-- ── Podgląd: bilety ─────────────────────────────────────────────────────────
SELECT tt.id, e.name AS event, tt.name AS ticket_type,
       tt.sales_start AS sales_start_now,
       (tt.sales_start AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw') AS sales_start_fixed,
       tt.sales_end AS sales_end_now,
       (tt.sales_end AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw') AS sales_end_fixed
  FROM public.ticket_types tt
  JOIN public.events e ON e.id = tt.event_id
 WHERE (tt.sales_start IS NOT NULL OR tt.sales_end IS NOT NULL)
   AND tt.created_at < (SELECT deployed_at FROM fix_params)
   AND tt.id NOT IN (SELECT id FROM excluded_ids)
 ORDER BY e.name, tt.name;

-- ── Podgląd: kody rabatowe ──────────────────────────────────────────────────
SELECT dc.id, e.name AS event, dc.code,
       dc.valid_from AS valid_from_now,
       (dc.valid_from AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw') AS valid_from_fixed,
       dc.valid_until AS valid_until_now,
       (dc.valid_until AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw') AS valid_until_fixed
  FROM public.discount_codes dc
  JOIN public.events e ON e.id = dc.event_id
 WHERE (dc.valid_from IS NOT NULL OR dc.valid_until IS NOT NULL)
   AND dc.created_at < (SELECT deployed_at FROM fix_params)
   AND dc.id NOT IN (SELECT id FROM excluded_ids)
 ORDER BY e.name, dc.code;

-- ── Korekta ─────────────────────────────────────────────────────────────────
UPDATE public.ticket_types tt
   SET sales_start = (tt.sales_start AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw'),
       sales_end   = (tt.sales_end   AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw')
  FROM public.events e
 WHERE e.id = tt.event_id
   AND (tt.sales_start IS NOT NULL OR tt.sales_end IS NOT NULL)
   AND tt.created_at < (SELECT deployed_at FROM fix_params)
   AND tt.id NOT IN (SELECT id FROM excluded_ids);

UPDATE public.discount_codes dc
   SET valid_from  = (dc.valid_from  AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw'),
       valid_until = (dc.valid_until AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.timezone, 'Europe/Warsaw')
  FROM public.events e
 WHERE e.id = dc.event_id
   AND (dc.valid_from IS NOT NULL OR dc.valid_until IS NOT NULL)
   AND dc.created_at < (SELECT deployed_at FROM fix_params)
   AND dc.id NOT IN (SELECT id FROM excluded_ids);

ROLLBACK;  -- ← zamień na COMMIT dopiero po sprawdzeniu podglądu
