-- ════════════════════════════════════════════════════════════════════════════
-- Eventro — sprzątanie danych testowych (2026-10-20)
--
-- NIE jest migracją (katalog supabase/cleanup/, nie supabase/migrations/) — nie wykona się
-- automatycznie. Uruchamia właściciel ręcznie w Supabase → SQL Editor, PO zrobieniu kopii
-- zapasowej (Database → Backups) i PO przejrzeniu wyników bloku podglądu.
--
-- Domyślnie skrypt kończy się ROLLBACK: można go uruchomić „na sucho”, obejrzeć liczby
-- przed i po, i nic się nie zmieni. Żeby faktycznie usunąć dane, właściciel świadomie
-- zamienia na końcu ROLLBACK na COMMIT.
--
-- Decyzje właściciela (2026-10-20):
--   USUWAMY:
--     • wydarzenie „Cyber” (cyber-hr) w organizacji EBS — samo wydarzenie, organizacja EBS ZOSTAJE
--     • organizację „EMPLOYER BRANDING SOLUTIONS SP. Z O.O.” (hr) + „Konferencja Cyber HR”
--     • organizację „Employer Branding Solutions” (hrmindfulness, pusta)
--     • organizację „Łódzka Fabryka Eventów” (lodzka-fabryka-eventow) + „Test checklisty”
--   ZOSTAJE (demo): organizacja i wydarzenie „Next Stop Łódź” — jedyna zmiana: unieważnienie
--     aktywnych linków moderatora (revoked_at), bez kasowania.
--   NIE RUSZAMY: organizacji EBS i jej rekordów rozliczeń (subskrypcja, override planu,
--     klient Stripe w billing_customers) — po stronie Stripe też nic się nie zmienia.
--   Konta logowania: osobna sekcja na końcu, ZAKOMENTOWANA (potwierdzenie osobno).
--
-- Kolejność usuwania: część kluczy obcych do events NIE ma ON DELETE CASCADE (attendees,
-- speakers, sessions, quests, rewards, matches, event_analytics_log), a orders/tickets mają
-- ON DELETE RESTRICT; events.organization_id też nie ma kaskady. Dlatego te tabele są
-- czyszczone jawnie, od liści do korzenia. Pozostałe zależności (partnerzy i ich tabele,
-- typy biletów, mixery, sekcje treści, linki moderatora itd.) usuwa kaskada z events,
-- a subskrypcje/override/billing — kaskada z organizations (dla usuwanych organizacji
-- jest ich 0).
--
-- Audyt leadów (partner_lead_audit) ma trigger append-only, ale przepuszcza DELETE z kaskady
-- (gdy partner albo wydarzenie już nie istnieje). Usuwane wydarzenia mają 0 wpisów audytu
-- (inwentaryzacja 2026-10-20), więc żadne obejście triggera nie jest potrzebne i nie jest
-- tu wykonywane.
--
-- Usuwanie WYŁĄCZNIE po identyfikatorach UUID (z inwentaryzacji tylko do odczytu), nigdy po
-- wzorcach nazw. Na początku asercje: każdy UUID musi istnieć i mieć oczekiwaną nazwę/slug,
-- inaczej skrypt przerywa się wyjątkiem (cała transakcja się wycofuje).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Identyfikatory ──────────────────────────────────────────────────────────
CREATE TEMP TABLE cleanup_events (id uuid PRIMARY KEY, slug text NOT NULL, label text NOT NULL) ON COMMIT DROP;
INSERT INTO cleanup_events (id, slug, label) VALUES
  ('36026ee7-98ce-463b-8776-bf4ffda25108', 'cyber-hr',             'Cyber (org. EBS)'),
  ('61039a0a-6684-494a-8ff8-4d1cd11b0f7b', 'konferencja-cyber-hr', 'Konferencja Cyber HR (org. hr)'),
  ('62da34a3-9b15-448d-a265-f36468c200d3', 'test-checklisty',      'Test checklisty (org. lodzka-fabryka-eventow)');

CREATE TEMP TABLE cleanup_orgs (id uuid PRIMARY KEY, slug text NOT NULL, name text NOT NULL) ON COMMIT DROP;
INSERT INTO cleanup_orgs (id, slug, name) VALUES
  ('6842cdf1-6274-4483-b7f8-29464d66a029', 'hr',                     'EMPLOYER BRANDING SOLUTIONS SP. Z O.O.'),
  ('0bef270d-f355-4268-a6fc-9a574a6e8fb8', 'hrmindfulness',          'Employer Branding Solutions'),
  ('2811e221-b618-4276-b85a-c029aaa2c6af', 'lodzka-fabryka-eventow', 'Łódzka Fabryka Eventów');

-- Linki moderatora „Next Stop Łódź” (wydarzenie 03ec2adb-708c-4724-97cc-2653f708b777, ZOSTAJE).
-- „Konferansjer” jest już unieważniony od 2026-10-04 — UPDATE pominie go (revoked_at IS NULL).
CREATE TEMP TABLE cleanup_mod_links (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;
INSERT INTO cleanup_mod_links (id, label) VALUES
  ('b6346a9c-0d0d-4d44-a83b-cde42b7a0364', 'Konferansjer'),
  ('664c9bb6-181c-48cf-a96b-627a9b938c34', 'Anna'),
  ('4f396d75-c6a3-493e-a93a-618b40cc471e', 'Ola');

-- ── 0. Asercje — przerwij, jeśli cokolwiek się nie zgadza ───────────────────
DO $$
DECLARE r record;
BEGIN
  -- Wydarzenia do usunięcia: istnieją, slug się zgadza, należą do oczekiwanych organizacji.
  FOR r IN SELECT c.*, e.slug AS db_slug FROM cleanup_events c LEFT JOIN public.events e ON e.id = c.id LOOP
    IF r.db_slug IS NULL THEN RAISE EXCEPTION 'Brak wydarzenia % (%)', r.id, r.label; END IF;
    IF r.db_slug <> r.slug THEN RAISE EXCEPTION 'Wydarzenie % ma slug %, oczekiwano %', r.id, r.db_slug, r.slug; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = '36026ee7-98ce-463b-8776-bf4ffda25108'
                 AND organization_id = '52e9d846-5218-4776-a01d-2a6beb2e99f0') THEN
    RAISE EXCEPTION '„Cyber” nie należy do organizacji EBS — przerwano';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = '61039a0a-6684-494a-8ff8-4d1cd11b0f7b'
                 AND organization_id = '6842cdf1-6274-4483-b7f8-29464d66a029') THEN
    RAISE EXCEPTION '„Konferencja Cyber HR” nie należy do organizacji hr — przerwano';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = '62da34a3-9b15-448d-a265-f36468c200d3'
                 AND organization_id = '2811e221-b618-4276-b85a-c029aaa2c6af') THEN
    RAISE EXCEPTION '„Test checklisty” nie należy do organizacji lodzka-fabryka-eventow — przerwano';
  END IF;

  -- Organizacje do usunięcia: istnieją, slug i nazwa się zgadzają.
  FOR r IN SELECT c.*, o.slug AS db_slug, o.name AS db_name FROM cleanup_orgs c LEFT JOIN public.organizations o ON o.id = c.id LOOP
    IF r.db_slug IS NULL THEN RAISE EXCEPTION 'Brak organizacji % (%)', r.id, r.name; END IF;
    IF r.db_slug <> r.slug OR r.db_name <> r.name THEN
      RAISE EXCEPTION 'Organizacja % to „%” (%), oczekiwano „%” (%)', r.id, r.db_name, r.db_slug, r.name, r.slug;
    END IF;
  END LOOP;

  -- Usuwane organizacje nie mogą mieć innych wydarzeń niż te z listy (także miękko usuniętych).
  IF EXISTS (SELECT 1 FROM public.events e WHERE e.organization_id IN (SELECT id FROM cleanup_orgs)
             AND e.id NOT IN (SELECT id FROM cleanup_events)) THEN
    RAISE EXCEPTION 'Usuwana organizacja ma wydarzenie spoza listy — przerwano';
  END IF;

  -- Organizacje, które ZOSTAJĄ, nie mogą być na liście.
  IF EXISTS (SELECT 1 FROM cleanup_orgs WHERE id IN ('52e9d846-5218-4776-a01d-2a6beb2e99f0',   -- EBS
                                                     '213236f4-e988-400b-967a-e3fea8505b08')) -- Next Stop Łódź
  THEN RAISE EXCEPTION 'Na liście do usunięcia jest organizacja, która ma zostać'; END IF;
  IF EXISTS (SELECT 1 FROM cleanup_events WHERE id = '03ec2adb-708c-4724-97cc-2653f708b777')
  THEN RAISE EXCEPTION 'Na liście do usunięcia jest wydarzenie Next Stop Łódź'; END IF;

  -- Linki moderatora: istnieją, mają oczekiwaną etykietę i należą do Next Stop Łódź.
  FOR r IN SELECT c.*, m.label AS db_label, m.event_id FROM cleanup_mod_links c LEFT JOIN public.moderator_links m ON m.id = c.id LOOP
    IF r.db_label IS NULL THEN RAISE EXCEPTION 'Brak linku moderatora %', r.id; END IF;
    IF r.db_label <> r.label OR r.event_id <> '03ec2adb-708c-4724-97cc-2653f708b777' THEN
      RAISE EXCEPTION 'Link moderatora % to „%” w wydarzeniu %, oczekiwano „%” w Next Stop Łódź', r.id, r.db_label, r.event_id, r.label;
    END IF;
  END LOOP;

  RAISE NOTICE 'Asercje OK';
END $$;

-- ── 1. PODGLĄD (tylko SELECT): wiersze do usunięcia per wydarzenie ───────────
-- Oczekiwane wartości z inwentaryzacji 2026-10-20 w komentarzu przy każdej tabeli
-- (tylko niezerowe; brak = 0). „Konferencja Cyber HR” i „Test checklisty” są puste.
SELECT c.label AS wydarzenie, x.tabela, x.liczba
FROM cleanup_events c
CROSS JOIN LATERAL (VALUES
  ('attendees',              (SELECT count(*) FROM public.attendees              WHERE event_id = c.id)), -- Cyber: 23
  ('speakers',               (SELECT count(*) FROM public.speakers               WHERE event_id = c.id)), -- Cyber: 6
  ('sessions',               (SELECT count(*) FROM public.sessions               WHERE event_id = c.id)), -- Cyber: 2
  ('quests',                 (SELECT count(*) FROM public.quests                 WHERE event_id = c.id)), -- Cyber: 3
  ('quest_completions',      (SELECT count(*) FROM public.quest_completions qc JOIN public.quests q ON q.id = qc.quest_id WHERE q.event_id = c.id)), -- Cyber: 2
  ('rewards',                (SELECT count(*) FROM public.rewards                WHERE event_id = c.id)), -- Cyber: 2
  ('partners',               (SELECT count(*) FROM public.partners               WHERE event_id = c.id)), -- Cyber: 1 („Partner Testowy”)
  ('checkins',               (SELECT count(*) FROM public.checkins ch JOIN public.partners p ON p.id = ch.partner_id WHERE p.event_id = c.id)),
  ('mixers',                 (SELECT count(*) FROM public.mixers                 WHERE event_id = c.id)), -- Cyber: 1
  ('event_content_sections', (SELECT count(*) FROM public.event_content_sections WHERE event_id = c.id)), -- Cyber: 3
  ('event_message_templates',(SELECT count(*) FROM public.event_message_templates WHERE event_id = c.id)), -- Cyber: 1
  ('matches',                (SELECT count(*) FROM public.matches                WHERE event_id = c.id)),
  ('event_analytics_log',    (SELECT count(*) FROM public.event_analytics_log    WHERE event_id = c.id)),
  ('polls',                  (SELECT count(*) FROM public.polls                  WHERE event_id = c.id)),
  ('ticket_types',           (SELECT count(*) FROM public.ticket_types           WHERE event_id = c.id)),
  ('orders',                 (SELECT count(*) FROM public.orders                 WHERE event_id = c.id)),
  ('tickets',                (SELECT count(*) FROM public.tickets                WHERE event_id = c.id)),
  ('moderator_links',        (SELECT count(*) FROM public.moderator_links        WHERE event_id = c.id)),
  ('partner_lead_audit',     (SELECT count(*) FROM public.partner_lead_audit     WHERE event_id = c.id)),
  ('partner_booth_requests', (SELECT count(*) FROM public.partner_booth_requests WHERE event_id = c.id)),
  ('booth_catalog_items',    (SELECT count(*) FROM public.booth_catalog_items    WHERE event_id = c.id))
) AS x(tabela, liczba)
WHERE x.liczba > 0
ORDER BY c.label, x.tabela;

-- Podgląd per organizacja (do usunięcia): oczekiwane hr: events 1; hrmindfulness: 0;
-- lodzka-fabryka-eventow: events 1; subskrypcji/override/billing — 0 we wszystkich trzech.
SELECT o.name AS organizacja,
  (SELECT count(*) FROM public.events                WHERE organization_id = o.id) AS events,
  (SELECT count(*) FROM public.subscriptions         WHERE organization_id = o.id) AS subscriptions,
  (SELECT count(*) FROM public.entitlement_overrides WHERE organization_id = o.id) AS entitlement_overrides,
  (SELECT count(*) FROM public.billing_customers     WHERE organization_id = o.id) AS billing_customers
FROM cleanup_orgs o ORDER BY o.name;

-- Podgląd linków moderatora Next Stop Łódź (oczekiwane: Anna i Ola aktywne, Konferansjer już unieważniony).
SELECT m.label, m.room, m.revoked_at FROM public.moderator_links m WHERE m.id IN (SELECT id FROM cleanup_mod_links) ORDER BY m.created_at;

-- Pliki w Storage powiązane z usuwanymi wydarzeniami — DO RĘCZNEGO usunięcia (Storage → bucket
-- → folder <id wydarzenia>). Skrypt ich NIE kasuje. Ścieżki zaczynają się od id wydarzenia.
SELECT bucket_id, name
FROM storage.objects
WHERE split_part(name, '/', 1) IN (SELECT id::text FROM cleanup_events)
ORDER BY bucket_id, name;

-- ── 2. Unieważnienie linków moderatora Next Stop Łódź (bez kasowania) ────────
UPDATE public.moderator_links
SET revoked_at = now()
WHERE id IN (SELECT id FROM cleanup_mod_links)
  AND event_id = '03ec2adb-708c-4724-97cc-2653f708b777'
  AND revoked_at IS NULL;  -- oczekiwane: 2 wiersze (Anna, Ola)

-- ── 3. Usuwanie wydarzeń — od liści do korzenia ─────────────────────────────
-- Tabele bez ON DELETE CASCADE do events (albo z RESTRICT) — jawnie:
DELETE FROM public.event_analytics_log WHERE event_id IN (SELECT id FROM cleanup_events);
DELETE FROM public.matches             WHERE event_id IN (SELECT id FROM cleanup_events);
DELETE FROM public.tickets             WHERE event_id IN (SELECT id FROM cleanup_events); -- RESTRICT; 0 wg inwentaryzacji
DELETE FROM public.orders              WHERE event_id IN (SELECT id FROM cleanup_events); -- RESTRICT; 0 wg inwentaryzacji (order_items: kaskada)
DELETE FROM public.polls               WHERE event_id IN (SELECT id FROM cleanup_events); -- poll_answers: kaskada
-- quest_completions i quiz_attempts: kaskada z quests
DELETE FROM public.quests              WHERE event_id IN (SELECT id FROM cleanup_events);
-- reward_redemptions: kaskada z rewards
DELETE FROM public.rewards             WHERE event_id IN (SELECT id FROM cleanup_events);
-- questions, feedback, agenda_items, session_speakers, moderator_notes: kaskada z sessions.
-- sessions.speaker_id → speakers bez kaskady, więc sesje przed prelegentami.
DELETE FROM public.sessions            WHERE event_id IN (SELECT id FROM cleanup_events);
DELETE FROM public.speakers            WHERE event_id IN (SELECT id FROM cleanup_events);
-- checkins, lead_consents, question_votes, reward_redemptions, contact_requests,
-- match_suggestions, partner_lead_consents…: kaskada z attendees; mixer_participants,
-- tickets.attendee_id, event_analytics_log.attendee_id: SET NULL.
DELETE FROM public.attendees           WHERE event_id IN (SELECT id FROM cleanup_events);
-- partner_booth_request_items.catalog_item_id → booth_catalog_items bez kaskady: pozycje
-- wniosków przed katalogiem (oba też kaskadują z events, ale jawnie dla pewności).
DELETE FROM public.partner_booth_request_items WHERE event_id IN (SELECT id FROM cleanup_events);
-- Reszta (partners → checkins/partner_*, quests partnera, ticket_types, discount_codes, mixers,
-- event_sections, event_content_sections, event_message_templates, moderator_links,
-- event_alerts, event_suspensions, booth_*, partner_lead_audit…) — kaskada z events.
DELETE FROM public.events WHERE id IN (SELECT id FROM cleanup_events);  -- oczekiwane: 3

-- ── 4. Usuwanie organizacji ─────────────────────────────────────────────────
-- subscriptions, entitlement_overrides, billing_customers, organizer_payment_config,
-- organization_suspensions: kaskada (dla tych trzech organizacji — 0 wierszy).
DELETE FROM public.organizations WHERE id IN (SELECT id FROM cleanup_orgs);  -- oczekiwane: 3

-- ── 5. Sprawdzenie po usunięciu (wszystko powinno być 0) ─────────────────────
SELECT
  (SELECT count(*) FROM public.events        WHERE id IN (SELECT id FROM cleanup_events))           AS events_pozostale,
  (SELECT count(*) FROM public.organizations WHERE id IN (SELECT id FROM cleanup_orgs))             AS organizacje_pozostale,
  (SELECT count(*) FROM public.attendees     WHERE event_id IN (SELECT id FROM cleanup_events))     AS uczestnicy_pozostali,
  (SELECT count(*) FROM public.moderator_links WHERE id IN (SELECT id FROM cleanup_mod_links) AND revoked_at IS NULL) AS aktywne_linki_moderatora,
  (SELECT count(*) FROM public.organizations WHERE id IN ('52e9d846-5218-4776-a01d-2a6beb2e99f0','213236f4-e988-400b-967a-e3fea8505b08')) AS ebs_i_next_stop_istnieja,  -- oczekiwane: 2
  (SELECT count(*) FROM public.events        WHERE id = '03ec2adb-708c-4724-97cc-2653f708b777')     AS next_stop_istnieje;           -- oczekiwane: 1

-- ── 6. Zakończenie ──────────────────────────────────────────────────────────
-- Domyślnie ROLLBACK: nic się nie zmienia. Po przejrzeniu wyników i zrobieniu kopii zapasowej
-- właściciel ŚWIADOMIE zamienia poniższe ROLLBACK na COMMIT (zakomentuj ROLLBACK, odkomentuj COMMIT).
ROLLBACK;
-- COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. KONTA LOGOWANIA (auth.users) — ZAKOMENTOWANE. Uruchomić OSOBNO, dopiero po skutecznym
--    COMMIT powyżej (organizations.owner_user_id → auth.users nie ma kaskady, więc konto
--    właściciela istniejącej organizacji się nie usunie) i po osobnym potwierdzeniu właściciela.
--    partner_access.user_id: kaskada; *_submitted_by: SET NULL.
--    Konta ZOSTAJĄ: chylinskips@gmail.com, chylinskioffice@gmail.com, mchylinski@strefa-kreatywnosci.com.
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.organizations WHERE owner_user_id IN (
--     '00ef7c90-1c58-4140-9f50-c0a98c6b952e', '3b6e1b31-1822-4b97-ad66-6e3168c63301', '8756d011-1d61-40b8-9f6f-7ad4428bfbad'))
--   THEN RAISE EXCEPTION 'Konto jest nadal właścicielem organizacji — najpierw usuń organizację'; END IF;
-- END $$;
-- DELETE FROM auth.users WHERE (id, email) IN (
--   ('00ef7c90-1c58-4140-9f50-c0a98c6b952e'::uuid, 'ewapietraszczyk@gmail.com'),
--   ('3b6e1b31-1822-4b97-ad66-6e3168c63301'::uuid, 'echylinska@strefa-kreatywnosci.com'),
--   ('8756d011-1d61-40b8-9f6f-7ad4428bfbad'::uuid, 'biurocyberbox@gmail.com')
-- );  -- oczekiwane: 3
-- ROLLBACK;
-- -- COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Do ręcznego sprzątnięcia poza SQL:
--  • Storage — wynik zapytania „Pliki w Storage” w bloku 1. Wg inwentaryzacji m.in.:
--      event-logos/36026ee7-…/ (logo, tło identyfikatora), event-content/36026ee7-…/ (baner,
--      zdjęcie sekcji), speaker-photos/36026ee7-…/ (6 zdjęć), reward-images/36026ee7-…/ (2),
--      attendee-avatars/36026ee7-…/ (2); event-logos/61039a0a-…/ (logo, tło identyfikatora).
--      „Test checklisty” — brak plików.
--  • Vercel → Domains: żadne z usuwanych wydarzeń nie jest opublikowane i żadna subdomena
--      (cyber-hr, konferencja-cyber-hr, test-checklisty .eventro.pl) nie jest podpięta
--      (sprawdzone 2026-10-20: brak wdrożenia pod tymi adresami) — nic do zrobienia.
--  • Stripe: bez zmian (klient i subskrypcja EBS zostają razem z organizacją EBS).
-- ════════════════════════════════════════════════════════════════════════════
