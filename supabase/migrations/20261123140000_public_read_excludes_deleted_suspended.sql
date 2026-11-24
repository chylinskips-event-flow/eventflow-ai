-- Publiczne polityki odczytu pomijają wydarzenia usunięte (deleted_at) i zawieszone
-- (zawieszenie wydarzenia albo organizacji). Idempotentna, kończy się NOTIFY pgrst.
-- Można uruchomić niezależnie od wdrożenia kodu: tylko zawęża odczyt.
--
-- Po 20261120100000_public_read_without_tokens.sql zostały polityki „public can view …”
-- dla: speakers, polls, event_content_sections, session_speakers, rewards. Każda sprawdza
-- status wydarzenia podzapytaniem do events; dokładamy warunki deleted_at IS NULL
-- i brak zawieszenia. Zakres ról i pozostałe warunki bez zmian.
--
-- Funkcja is_event_suspended_by_id: SECURITY DEFINER, bo anon/authenticated nie czytają
-- tabel event_suspensions/organization_suspensions. Zwraca tylko wartość logiczną.
-- Istniejąca is_event_suspended(p_slug) zostaje bez zmian.

CREATE OR REPLACE FUNCTION public.is_event_suspended_by_id(p_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id
      AND (
        EXISTS (SELECT 1 FROM public.event_suspensions es WHERE es.event_id = e.id)
        OR EXISTS (SELECT 1 FROM public.organization_suspensions os WHERE os.organization_id = e.organization_id)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_event_suspended_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_event_suspended_by_id(uuid) TO anon, authenticated, service_role;

-- speakers
DROP POLICY IF EXISTS "public can view speakers of published or live events" ON public.speakers;
CREATE POLICY "public can view speakers of published or live events"
ON public.speakers
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = speakers.event_id
      AND events.status IN ('published', 'live')
      AND events.deleted_at IS NULL
      AND NOT public.is_event_suspended_by_id(events.id)
  )
);

-- polls (tylko otwarte)
DROP POLICY IF EXISTS "public can view open polls of published or live events" ON public.polls;
CREATE POLICY "public can view open polls of published or live events"
ON public.polls
FOR SELECT
TO anon, authenticated
USING (
  status = 'open'
  AND EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = polls.event_id
      AND events.status IN ('published', 'live')
      AND events.deleted_at IS NULL
      AND NOT public.is_event_suspended_by_id(events.id)
  )
);

-- event_content_sections
DROP POLICY IF EXISTS "public can view content sections of published or live events" ON public.event_content_sections;
CREATE POLICY "public can view content sections of published or live events"
ON public.event_content_sections
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = event_content_sections.event_id
      AND events.status IN ('published', 'live')
      AND events.deleted_at IS NULL
      AND NOT public.is_event_suspended_by_id(events.id)
  )
);

-- session_speakers (przez sessions -> events)
DROP POLICY IF EXISTS "public can view session speakers of published or live events" ON public.session_speakers;
CREATE POLICY "public can view session speakers of published or live events"
ON public.session_speakers
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sessions
    JOIN public.events ON events.id = sessions.event_id
    WHERE sessions.id = session_speakers.session_id
      AND events.status IN ('published', 'live')
      AND events.deleted_at IS NULL
      AND NOT public.is_event_suspended_by_id(events.id)
  )
);

-- rewards
DROP POLICY IF EXISTS "public can view rewards of published or live events" ON public.rewards;
CREATE POLICY "public can view rewards of published or live events"
ON public.rewards
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = rewards.event_id
      AND events.status IN ('published', 'live')
      AND events.deleted_at IS NULL
      AND NOT public.is_event_suspended_by_id(events.id)
  )
);

NOTIFY pgrst, 'reload schema';
