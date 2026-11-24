-- Grywalizacja: atomowe zapisy punktów i prób quizu oraz trwałe wykluczenia z loterii.
--
-- 1. add_attendee_points(p_attendee_id, p_delta)
--    Dolicza punkty jednym UPDATE (points = points + delta) i w tym samym poleceniu
--    przelicza poziom. Wcześniej aplikacja czytała punkty, dodawała je u siebie i zapisywała
--    wynik — dwa równoległe zaliczenia questów mogły nadpisać się nawzajem.
--    Progi poziomów muszą odpowiadać computeLevel() w src/lib/gamification.ts.
--
-- 2. claim_quiz_attempt(p_quest_id, p_attendee_id, p_max_attempts, p_cooldown_seconds)
--    Rezerwuje kolejną próbę quizu / hasła stoiska jednym INSERT ... ON CONFLICT DO UPDATE
--    z warunkiem (limit prób i przerwa między próbami). Zwraca numer zarezerwowanej próby
--    (1, 2, ...) albo NULL, gdy próby nie wolno teraz wykonać. Równoległe wywołania są
--    szeregowane przez blokadę wiersza, więc każde widzi aktualny licznik.
--
-- 3. lottery_exclusions — wykluczenia z losowania zapisane w bazie (wcześniej tylko w stanie
--    przeglądarki). RLS włączone bez polityk: dostęp wyłącznie przez service_role po
--    autoryzacji organizatora w akcji serwera.
--
-- Migracja tylko dodaje obiekty — kod sprzed zmiany działa z nią bez zmian.

-- ---------------------------------------------------------------------------
-- 1. Punkty uczestnika
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_attendee_points(p_attendee_id uuid, p_delta integer)
RETURNS TABLE (new_points integer, new_level text)
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  UPDATE public.attendees AS a
     SET points = a.points + p_delta,
         level = CASE
                   WHEN a.points + p_delta >= 500 THEN 'ambassador'
                   WHEN a.points + p_delta >= 250 THEN 'networker'
                   WHEN a.points + p_delta >= 100 THEN 'connector'
                   ELSE 'explorer'
                 END
   WHERE a.id = p_attendee_id
  RETURNING a.points, a.level;
$$;

REVOKE ALL ON FUNCTION public.add_attendee_points(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_attendee_points(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Próby quizu / hasła stoiska
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_quiz_attempt(
  p_quest_id uuid,
  p_attendee_id uuid,
  p_max_attempts integer,
  p_cooldown_seconds integer
)
RETURNS integer
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  INSERT INTO public.quiz_attempts AS q (quest_id, attendee_id, attempts, last_attempt_at)
  VALUES (p_quest_id, p_attendee_id, 1, now())
  ON CONFLICT (quest_id, attendee_id) DO UPDATE
     SET attempts = q.attempts + 1,
         last_attempt_at = now()
   WHERE q.attempts < p_max_attempts
     AND (
       q.attempts = 0
       OR q.last_attempt_at IS NULL
       OR q.last_attempt_at <= now() - make_interval(secs => p_cooldown_seconds)
     )
  RETURNING q.attempts;
$$;

REVOKE ALL ON FUNCTION public.claim_quiz_attempt(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_quiz_attempt(uuid, uuid, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Wykluczenia z loterii
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lottery_exclusions (
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  attendee_id uuid NOT NULL REFERENCES public.attendees (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, attendee_id)
);

-- Indeks pod kaskadę usuwania uczestnika (RODO) — spójnie z resztą tabel.
CREATE INDEX IF NOT EXISTS idx_lottery_exclusions_attendee_id
  ON public.lottery_exclusions (attendee_id);

ALTER TABLE public.lottery_exclusions ENABLE ROW LEVEL SECURITY;
-- Brak polityk = deny-all dla anon/authenticated; dodatkowo bez uprawnień tabelowych.
REVOKE ALL ON TABLE public.lottery_exclusions FROM anon, authenticated;
GRANT ALL ON TABLE public.lottery_exclusions TO service_role;

NOTIFY pgrst, 'reload schema';
