-- ════════════════════════════════════════════════════════════════════════════
-- Eventro — sprzątanie testowych uczestników w demo „Next Stop Łódź” (2026-10-22)
--
-- NIE jest migracją (katalog supabase/cleanup/) — nie wykona się automatycznie. Uruchamia
-- właściciel ręcznie w Supabase → SQL Editor, po przejrzeniu wyników podglądu.
-- Domyślnie kończy się ROLLBACK (przebieg „na sucho”). Żeby usunąć dane, właściciel świadomie
-- zamienia na końcu ROLLBACK na COMMIT.
--
-- Wydarzenie: Next Stop Łódź, id 03ec2adb-708c-4724-97cc-2653f708b777, slug nextstoplodz.
--   ZOSTAJE: rekord chylinskips@gmail.com z rejestracją 2026-10-15 (a917da39…) jako uczestnik
--            demo — ma dane demo (quest, check-in na stoisku) i 3 zgody leadowe partnera.
--   ZNIKA:   chylinskips@gmail.com z 2026-10-03 i z 2026-10-20,
--            chylinskips+test4@gmail.com, chylinskips+test5@gmail.com.
--   Nie ruszamy innych uczestników, innych wydarzeń, organizacji, auth.users ani Storage
--   (żaden z usuwanych rekordów nie ma avatara).
--
-- Wybór rekordów: event_id + lower(btrim(email)); z chylinskips@gmail.com wykluczony jest rekord
-- z datą rejestracji 2026-10-15 (czas Europe/Warsaw) — nie same id wpisane z ręki. Dodatkowo
-- asercje: dokładnie 4 rekordy, wszystkie z tego wydarzenia, podział 2 × chylinskips@gmail.com
-- (3.10 i 20.10) + test4 + test5, zgodność z inwentaryzacją (lista id poniżej tylko do
-- porównania) i dokładnie 1 rekord chylinskips@gmail.com, z 2026-10-15, zostaje.
--
-- Tabele odwołujące się do attendees (stan po migracjach z repo, m.in. 20260701100000,
-- 20260706100000, 20260923100000, 20260929130000, 20261008100000):
--   ON DELETE CASCADE (znikają razem z uczestnikiem):
--     agenda_items, quest_completions, quiz_attempts, questions (→ question_votes, także głosy
--     innych osób na te pytania), question_votes, poll_answers, reward_redemptions, matches (a/b),
--     match_suggestions (oba kierunki), checkins (→ lead_consents), feedback, contact_requests
--     (oba kierunki), partner_lead_consents (→ partner_question_answers), partner_question_answers
--   ON DELETE SET NULL (wiersz zostaje, bez powiązania z uczestnikiem):
--     event_analytics_log (metryka eventu, anonimizacja), tickets, mixer_participants
--   BEZ klucza obcego (wiersze zostają z samym identyfikatorem):
--     partner_lead_audit — dziennik append-only (trigger blokuje DELETE poza kaskadą z
--       events/partners); zgodnie z projektem wpis przeżywa usunięcie uczestnika.
--       Skrypt go NIE rusza i NIE omija triggera.
--     attendee_access_link_requests — tylko hashe e-maila/IP per wydarzenie (bez attendee_id),
--       czyszczone automatycznie po dobie.
--   Tabele, które trzeba czyścić ręcznie przed DELETE (FK bez CASCADE/SET NULL): BRAK.
--   Dlatego skrypt usuwa wyłącznie wiersze z attendees; resztę obsługują klucze obce.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Wybór rekordów ──────────────────────────────────────────────────────────
CREATE TEMP TABLE cleanup_attendees ON COMMIT DROP AS
SELECT a.id, lower(btrim(a.email)) AS email, a.created_at, a.event_id
FROM public.attendees a
WHERE a.event_id = '03ec2adb-708c-4724-97cc-2653f708b777'
  AND lower(btrim(a.email)) IN (
    'chylinskips@gmail.com',
    'chylinskips+test4@gmail.com',
    'chylinskips+test5@gmail.com'
  )
  -- rekord chylinskips@gmail.com z 2026-10-15 zostaje (dane demo i leady partnera)
  AND NOT (
    lower(btrim(a.email)) = 'chylinskips@gmail.com'
    AND (a.created_at AT TIME ZONE 'Europe/Warsaw')::date = DATE '2026-10-15'
  );

-- Oczekiwany wynik wg inwentaryzacji tylko do odczytu (2026-10-22) — wyłącznie do porównania.
CREATE TEMP TABLE expected_attendees (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;
INSERT INTO expected_attendees (id, label) VALUES
  ('16d043b9-4063-4099-97e7-79889674b297', 'chylinskips@gmail.com, 2026-10-03'),
  ('44804ddb-f2d6-4c6f-a6a9-71213e0c989b', 'chylinskips@gmail.com, 2026-10-20'),
  ('c2f336df-642d-438f-bda6-15ae6203856d', 'chylinskips+test4@gmail.com, 2026-10-22'),
  ('ea30110d-3b37-49d5-b2c5-8a51585c869f', 'chylinskips+test5@gmail.com, 2026-10-22');

-- ── 0. Asercje — przerwij, jeśli cokolwiek się nie zgadza ───────────────────
DO $$
DECLARE
  n_selected int;
  n_kept     int;
  kept_id    uuid;
  kept_date  date;
BEGIN
  SELECT count(*) INTO n_selected FROM cleanup_attendees;
  IF n_selected <> 4 THEN
    RAISE EXCEPTION 'Wybrano % rekordów, oczekiwano 4 — przerwano', n_selected;
  END IF;

  IF EXISTS (SELECT 1 FROM cleanup_attendees WHERE event_id <> '03ec2adb-708c-4724-97cc-2653f708b777') THEN
    RAISE EXCEPTION 'Wybrany rekord spoza wydarzenia Next Stop Łódź — przerwano';
  END IF;

  -- Podział: chylinskips@gmail.com dokładnie z 3.10 i 20.10, plus test4 i test5.
  IF (SELECT count(*) FROM cleanup_attendees WHERE email = 'chylinskips@gmail.com') <> 2
     OR NOT EXISTS (SELECT 1 FROM cleanup_attendees WHERE email = 'chylinskips@gmail.com'
                    AND (created_at AT TIME ZONE 'Europe/Warsaw')::date = DATE '2026-10-03')
     OR NOT EXISTS (SELECT 1 FROM cleanup_attendees WHERE email = 'chylinskips@gmail.com'
                    AND (created_at AT TIME ZONE 'Europe/Warsaw')::date = DATE '2026-10-20')
     OR (SELECT count(*) FROM cleanup_attendees WHERE email = 'chylinskips+test4@gmail.com') <> 1
     OR (SELECT count(*) FROM cleanup_attendees WHERE email = 'chylinskips+test5@gmail.com') <> 1 THEN
    RAISE EXCEPTION 'Podział wybranych rekordów inny niż chylinskips@ (3.10, 20.10) + test4 + test5 — przerwano';
  END IF;

  -- Wybór musi być identyczny z inwentaryzacją (w obie strony).
  IF EXISTS (SELECT id FROM cleanup_attendees EXCEPT SELECT id FROM expected_attendees)
     OR EXISTS (SELECT id FROM expected_attendees EXCEPT SELECT id FROM cleanup_attendees) THEN
    RAISE EXCEPTION 'Wybrane rekordy różnią się od inwentaryzacji z 2026-10-22 — przerwano';
  END IF;

  -- Po usunięciu zostaje dokładnie jeden chylinskips@gmail.com: ten z 2026-10-15 (a917da39…).
  SELECT count(*), min(id::text)::uuid, min((created_at AT TIME ZONE 'Europe/Warsaw')::date)
    INTO n_kept, kept_id, kept_date
  FROM public.attendees
  WHERE event_id = '03ec2adb-708c-4724-97cc-2653f708b777'
    AND lower(btrim(email)) = 'chylinskips@gmail.com'
    AND id NOT IN (SELECT id FROM cleanup_attendees);
  IF n_kept <> 1 OR kept_date <> DATE '2026-10-15'
     OR kept_id <> 'a917da39-89f3-4948-9f93-33f33c773609' THEN
    RAISE EXCEPTION 'Zostałoby % rekordów chylinskips@gmail.com (%, %), oczekiwano 1 z 2026-10-15 (a917da39…)',
      n_kept, kept_id, kept_date;
  END IF;

  RAISE NOTICE 'Asercje OK';
END $$;

-- ── 1. PODGLĄD (tylko SELECT) ───────────────────────────────────────────────
-- Wybrane rekordy.
SELECT c.id, c.email, c.created_at, e.label
FROM cleanup_attendees c JOIN expected_attendees e USING (id)
ORDER BY c.created_at;

-- Rekord, który ZOSTAJE (oczekiwany: a917da39…, 2026-10-15).
SELECT id, email, first_name, last_name, status, created_at
FROM public.attendees
WHERE event_id = '03ec2adb-708c-4724-97cc-2653f708b777'
  AND lower(btrim(email)) = 'chylinskips@gmail.com'
  AND id NOT IN (SELECT id FROM cleanup_attendees);

-- Wiersze zależne usuwanych rekordów per tabela (tylko niezerowe). Oczekiwane wg inwentaryzacji
-- 2026-10-22:
--   rekord 2026-10-03 (16d043b9…): questions 2 (głosów na nie: 0), poll_answers 1,
--     checkins 1 (lead_consents: 0), event_analytics_log 3 (SET NULL);
--   rekord 2026-10-20, test4, test5: brak danych.
--   (partner_lead_consents i partner_lead_audit: 0 — leady ma rekord, który zostaje.)
SELECT x.tabela, x.tryb, x.liczba
FROM (VALUES
  ('agenda_items',             'CASCADE',  (SELECT count(*) FROM public.agenda_items             WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('quest_completions',        'CASCADE',  (SELECT count(*) FROM public.quest_completions        WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('quiz_attempts',            'CASCADE',  (SELECT count(*) FROM public.quiz_attempts            WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('questions',                'CASCADE',  (SELECT count(*) FROM public.questions                WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('question_votes (własne i na usuwane pytania)', 'CASCADE',
                                           (SELECT count(*) FROM public.question_votes           WHERE attendee_id IN (SELECT id FROM cleanup_attendees)
                                                                                                    OR question_id IN (SELECT q.id FROM public.questions q WHERE q.attendee_id IN (SELECT id FROM cleanup_attendees)))),
  ('poll_answers',             'CASCADE',  (SELECT count(*) FROM public.poll_answers             WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('reward_redemptions',       'CASCADE',  (SELECT count(*) FROM public.reward_redemptions       WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('matches',                  'CASCADE',  (SELECT count(*) FROM public.matches                  WHERE attendee_a_id IN (SELECT id FROM cleanup_attendees) OR attendee_b_id IN (SELECT id FROM cleanup_attendees))),
  ('match_suggestions',        'CASCADE',  (SELECT count(*) FROM public.match_suggestions        WHERE attendee_id IN (SELECT id FROM cleanup_attendees) OR suggested_attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('checkins',                 'CASCADE',  (SELECT count(*) FROM public.checkins                 WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('feedback',                 'CASCADE',  (SELECT count(*) FROM public.feedback                 WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('contact_requests',         'CASCADE',  (SELECT count(*) FROM public.contact_requests         WHERE requester_id IN (SELECT id FROM cleanup_attendees) OR recipient_id IN (SELECT id FROM cleanup_attendees))),
  ('partner_lead_consents',    'CASCADE',  (SELECT count(*) FROM public.partner_lead_consents    WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('partner_question_answers', 'CASCADE',  (SELECT count(*) FROM public.partner_question_answers WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('event_analytics_log',      'SET NULL', (SELECT count(*) FROM public.event_analytics_log      WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('tickets',                  'SET NULL', (SELECT count(*) FROM public.tickets                  WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('mixer_participants',       'SET NULL', (SELECT count(*) FROM public.mixer_participants       WHERE attendee_id IN (SELECT id FROM cleanup_attendees))),
  ('partner_lead_audit',       'bez FK — zostaje', (SELECT count(*) FROM public.partner_lead_audit WHERE attendee_id IN (SELECT id FROM cleanup_attendees)))
) AS x(tabela, tryb, liczba)
WHERE x.liczba > 0
ORDER BY x.tabela;

-- Dane rekordu, który ZOSTAJE — nie mogą się zmienić (oczekiwane: quest_completions 1,
-- checkins 1, partner_lead_consents 3, partner_lead_audit 6, event_analytics_log 4).
SELECT
  (SELECT count(*) FROM public.quest_completions     WHERE attendee_id = 'a917da39-89f3-4948-9f93-33f33c773609') AS quest_completions,
  (SELECT count(*) FROM public.checkins              WHERE attendee_id = 'a917da39-89f3-4948-9f93-33f33c773609') AS checkins,
  (SELECT count(*) FROM public.partner_lead_consents WHERE attendee_id = 'a917da39-89f3-4948-9f93-33f33c773609') AS partner_lead_consents,
  (SELECT count(*) FROM public.partner_lead_audit    WHERE attendee_id = 'a917da39-89f3-4948-9f93-33f33c773609') AS partner_lead_audit,
  (SELECT count(*) FROM public.event_analytics_log   WHERE attendee_id = 'a917da39-89f3-4948-9f93-33f33c773609') AS event_analytics_log;

-- Liczba uczestników wydarzenia przed usunięciem (oczekiwane: 7 → po usunięciu 3).
SELECT count(*) AS uczestnicy_przed FROM public.attendees WHERE event_id = '03ec2adb-708c-4724-97cc-2653f708b777';

-- ── 2. Usunięcie ────────────────────────────────────────────────────────────
-- Żadna tabela zależna nie wymaga ręcznego czyszczenia (wszystkie FK: CASCADE albo SET NULL).
DELETE FROM public.attendees
WHERE id IN (SELECT id FROM cleanup_attendees)
  AND event_id = '03ec2adb-708c-4724-97cc-2653f708b777';  -- oczekiwane: 4

-- ── 3. Sprawdzenie po usunięciu ─────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.attendees WHERE id IN (SELECT id FROM cleanup_attendees)) AS usuniete_pozostale,          -- 0
  (SELECT count(*) FROM public.attendees
     WHERE event_id = '03ec2adb-708c-4724-97cc-2653f708b777'
       AND lower(btrim(email)) = 'chylinskips@gmail.com')                                AS chylinskips_zostaje,           -- 1
  (SELECT count(*) FROM public.attendees
     WHERE id = 'a917da39-89f3-4948-9f93-33f33c773609')                                  AS rekord_15_10_istnieje,         -- 1
  (SELECT count(*) FROM public.attendees WHERE event_id = '03ec2adb-708c-4724-97cc-2653f708b777') AS uczestnicy_po,   -- 3
  (SELECT count(*) FROM public.partner_lead_consents
     WHERE attendee_id = 'a917da39-89f3-4948-9f93-33f33c773609')                         AS zgody_leadowe_zostajacego;     -- 3

-- ── 4. Zakończenie ──────────────────────────────────────────────────────────
-- Domyślnie ROLLBACK: nic się nie zmienia. Po przejrzeniu wyników właściciel ŚWIADOMIE zamienia
-- poniższe ROLLBACK na COMMIT (zakomentuj ROLLBACK, odkomentuj COMMIT).
ROLLBACK;
-- COMMIT;
