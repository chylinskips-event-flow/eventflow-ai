-- #9 Panel super-admina (operatora platformy) — MVP.
-- Idempotentna. Zastosować w Supabase PRZED / razem z deployem (kończy się NOTIFY pgrst).
--
-- Zasady:
--  * Wszystkie tabele: RLS deny-all (bez polityk) — dostęp wyłącznie przez service_role,
--    po weryfikacji roli w kodzie (src/lib/platform-admin.ts).
--  * Rola i zawieszenia w OSOBNYCH tabelach, nie w organizations/events — właściciel ma
--    tam UPDATE przez RLS i mógłby sam nadać sobie rolę albo zdjąć zawieszenie.
--  * Funkcje SECURITY DEFINER zwracają wyłącznie boolean dla bieżącego użytkownika / sluga.

-- ── Rola super_admin ─────────────────────────────────────────────────────
-- Nadawana WYŁĄCZNIE ręcznie (SQL w Supabase) — brak self-service.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- ── Audyt akcji super-admina (zapis tylko serwerowo) ──────────────────────
CREATE TABLE IF NOT EXISTS public.super_admin_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  actor_email   text,
  action        text NOT NULL,          -- np. view_organization, set_override, suspend_event
  target_type   text,                   -- organization / event / platform
  target_id     text,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS super_admin_audit_log_created_at_idx
  ON public.super_admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS super_admin_audit_log_target_idx
  ON public.super_admin_audit_log (target_type, target_id);

-- ── Zawieszenia ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_suspensions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason          text,
  suspended_by    uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_suspensions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_suspensions (
  event_id     uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  reason       text,
  suspended_by uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_suspensions ENABLE ROW LEVEL SECURITY;

-- ── Funkcje sprawdzające (boolean, bez ujawniania danych) ─────────────────

-- Czy zalogowany użytkownik jest super-adminem (wywoływane klientem użytkownika, przed
-- jakimkolwiek użyciem service_role).
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Czy organizacja zalogowanego użytkownika jest zawieszona (middleware /admin).
CREATE OR REPLACE FUNCTION public.is_current_user_suspended()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.organization_suspensions s ON s.organization_id = o.id
    WHERE o.owner_user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_user_suspended() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_suspended() TO authenticated;

-- Czy publiczna strona eventu ma być niedostępna (zawieszony event lub jego organizacja).
-- Middleware /e/{slug} — także dla niezalogowanych.
CREATE OR REPLACE FUNCTION public.is_event_suspended(p_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.slug = p_slug
      AND (
        EXISTS (SELECT 1 FROM public.event_suspensions es WHERE es.event_id = e.id)
        OR EXISTS (SELECT 1 FROM public.organization_suspensions os WHERE os.organization_id = e.organization_id)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_event_suspended(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_event_suspended(text) TO anon, authenticated;

-- Liczniki do panelu (tylko service_role — wywoływane po weryfikacji roli).
-- Agregacja w SQL, żeby nie trafić w limit wierszy PostgREST (domyślnie 1000).
CREATE OR REPLACE FUNCTION public.platform_event_counts(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, attendees bigint, tickets bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT e.id,
         (SELECT count(*) FROM public.attendees a WHERE a.event_id = e.id AND a.status <> 'rejected'),
         (SELECT count(*) FROM public.tickets t WHERE t.event_id = e.id)
  FROM public.events e
  WHERE e.id = ANY (p_event_ids);
$$;
REVOKE ALL ON FUNCTION public.platform_event_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_event_counts(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_org_event_counts()
RETURNS TABLE (organization_id uuid, events bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT e.organization_id, count(*)
  FROM public.events e
  WHERE e.deleted_at IS NULL
  GROUP BY e.organization_id;
$$;
REVOKE ALL ON FUNCTION public.platform_org_event_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_org_event_counts() TO service_role;

NOTIFY pgrst, 'reload schema';
