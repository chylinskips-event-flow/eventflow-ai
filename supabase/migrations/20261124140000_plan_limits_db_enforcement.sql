-- Limity planu egzekwowane także w bazie (druga warstwa obok server actions).
-- Idempotentna. Bez zmian w danych i bez przepisywania tabel.
--
-- Organizator (rola authenticated) ma przez RLS INSERT/UPDATE na events i UPDATE na attendees
-- własnych wydarzeń, więc zapis bezpośrednio przez API z pominięciem server actions
-- nie przechodził kontroli planu. Triggery poniżej sprawdzają:
--   events:    max_events (aktywne = draft/published/live i nieusunięte) przy utworzeniu
--              lub przywróceniu wydarzenia; włączenie gamification_enabled (funkcja
--              'gamification') i ustawienie lottery_points_per_ticket ('gamification_rewards')
--              — tylko WŁĄCZANIE, jak w server actions (już włączone zostają);
--   attendees: max_attendees_per_event przy przywróceniu odrzuconego uczestnika
--              lub przeniesieniu do innego wydarzenia.
--
-- Egzekwowanie dotyczy WYŁĄCZNIE roli authenticated. service_role (server actions na kliencie
-- admina, webhooki, panel operatora) i bezpośrednie połączenia SQL są pomijane.
-- Istniejące wiersze nie są sprawdzane — trigger reaguje tylko na przejścia stanu.
--
-- Przełącznik: public.billing_settings.enforce_plan_limits (domyślnie false = pilotaż bez
-- limitów, tak jak BILLING_ENABLED != "true" w aplikacji). Włączać RAZEM z BILLING_ENABLED=true:
--   UPDATE public.billing_settings SET enforce_plan_limits = true;
--
-- Plan efektywny liczony jak w src/lib/entitlements-core.ts (computeEntitlements):
-- wyższy (sort_order) z planu override'u i planu żywej subskrypcji (remis → subskrypcja),
-- w przeciwnym razie 'free'; punktowe features/limits override'u na wierzchu planu.

-- ── Przełącznik egzekwowania (singleton, RLS deny-all) ─────────────────────
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  enforce_plan_limits boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.billing_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.billing_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Czy egzekwować limity dla bieżącego żądania ────────────────────────────
CREATE OR REPLACE FUNCTION public.plan_limits_enforced()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Tylko żądania z JWT organizatora; service_role i połączenia bez JWT — bez kontroli.
  -- Rola z JWT czytana jak w auth.role() (stary i nowy format ustawień PostgREST).
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claim.role', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     ) IS DISTINCT FROM 'authenticated' THEN
    RETURN false;
  END IF;
  RETURN COALESCE(
    (SELECT s.enforce_plan_limits FROM public.billing_settings s WHERE s.id),
    false
  );
END;
$$;

-- ── Źródła uprawnień organizacji (plan efektywny + override) ──────────────
CREATE OR REPLACE FUNCTION public.org_entitlement_sources(
  p_org uuid,
  OUT has_plan boolean,
  OUT plan_features jsonb,
  OUT plan_limits jsonb,
  OUT override_features jsonb,
  OUT override_limits jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ov_found     boolean := false;
  v_ov_plan_key  text;
  v_ov_features  jsonb;
  v_ov_limits    jsonb;
  v_ovp_found    boolean := false;
  v_ovp_sort     integer;
  v_ovp_features jsonb;
  v_ovp_limits   jsonb;
  v_sub_found    boolean := false;
  v_sub_sort     integer;
  v_sub_features jsonb;
  v_sub_limits   jsonb;
BEGIN
  SELECT o.plan_key, o.features, o.limits
    INTO v_ov_plan_key, v_ov_features, v_ov_limits
  FROM public.entitlement_overrides o
  WHERE o.organization_id = p_org
    AND (o.expires_at IS NULL OR o.expires_at > now());
  v_ov_found := FOUND;

  IF v_ov_found AND v_ov_plan_key IS NOT NULL THEN
    SELECT p.sort_order, p.features, p.limits
      INTO v_ovp_sort, v_ovp_features, v_ovp_limits
    FROM public.plans p
    WHERE p.key = v_ov_plan_key;
    v_ovp_found := FOUND;
  END IF;

  SELECT p.sort_order, p.features, p.limits
    INTO v_sub_sort, v_sub_features, v_sub_limits
  FROM public.subscriptions s
  JOIN public.plans p ON p.key = s.plan_key
  WHERE s.organization_id = p_org
    AND s.status IN ('trialing', 'active', 'past_due');
  v_sub_found := FOUND;

  IF v_ovp_found AND (NOT v_sub_found OR v_ovp_sort > v_sub_sort) THEN
    has_plan := true;
    plan_features := v_ovp_features;
    plan_limits := v_ovp_limits;
  ELSIF v_sub_found THEN
    has_plan := true;
    plan_features := v_sub_features;
    plan_limits := v_sub_limits;
  ELSE
    SELECT p.features, p.limits
      INTO plan_features, plan_limits
    FROM public.plans p
    WHERE p.key = 'free';
    -- Brak planu domyślnego = błędna konfiguracja — nikogo nie blokujemy.
    has_plan := FOUND;
  END IF;

  IF v_ov_found THEN
    override_features := v_ov_features;
    override_limits := v_ov_limits;
  END IF;
END;
$$;

-- Funkcja w planie efektywnym (override → plan → false). Bez planu: dostęp pełny.
CREATE OR REPLACE FUNCTION public.org_plan_feature(p_org uuid, p_feature text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.org_entitlement_sources(p_org);
  IF NOT COALESCE(e.has_plan, false) THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(e.override_features -> p_feature) = 'boolean' THEN
    RETURN (e.override_features ->> p_feature)::boolean;
  END IF;
  IF jsonb_typeof(e.plan_features -> p_feature) = 'boolean' THEN
    RETURN (e.plan_features ->> p_feature)::boolean;
  END IF;
  RETURN false;
END;
$$;

-- Limit w planie efektywnym; NULL = bez limitu (także brak klucza / brak planu).
CREATE OR REPLACE FUNCTION public.org_plan_limit(p_org uuid, p_limit text)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.org_entitlement_sources(p_org);
  IF NOT COALESCE(e.has_plan, false) THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(e.override_limits -> p_limit) IN ('number', 'null') THEN
    RETURN (e.override_limits ->> p_limit)::numeric;
  END IF;
  IF jsonb_typeof(e.plan_limits -> p_limit) IN ('number', 'null') THEN
    RETURN (e.plan_limits ->> p_limit)::numeric;
  END IF;
  RETURN NULL;
END;
$$;

-- ── events: max_events + włączanie funkcji z planu ────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_event_plan_limits()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_active    boolean;
  v_was_active    boolean := false;
  v_enabling_gam  boolean;
  v_enabling_lot  boolean;
  v_limit         numeric;
  v_count         bigint;
BEGIN
  IF NOT public.plan_limits_enforced() THEN
    RETURN NEW;
  END IF;

  v_new_active := NEW.deleted_at IS NULL AND NEW.status IN ('draft', 'published', 'live');
  v_enabling_gam := NEW.gamification_enabled;
  v_enabling_lot := NEW.lottery_points_per_ticket IS NOT NULL;

  IF TG_OP = 'UPDATE' THEN
    v_was_active := OLD.deleted_at IS NULL
      AND OLD.status IN ('draft', 'published', 'live')
      AND OLD.organization_id = NEW.organization_id;
    v_enabling_gam := v_enabling_gam AND NOT OLD.gamification_enabled;
    v_enabling_lot := v_enabling_lot AND OLD.lottery_points_per_ticket IS NULL;
  END IF;

  IF v_new_active AND NOT v_was_active THEN
    v_limit := public.org_plan_limit(NEW.organization_id, 'max_events');
    IF v_limit IS NOT NULL THEN
      -- Serializuje równoległe zapisy jednej organizacji (zwolnienie przy końcu transakcji).
      PERFORM pg_advisory_xact_lock(
        hashtextextended('plan_max_events:' || NEW.organization_id::text, 0));
      SELECT count(*) INTO v_count
      FROM public.events e
      WHERE e.organization_id = NEW.organization_id
        AND e.deleted_at IS NULL
        AND e.status IN ('draft', 'published', 'live')
        AND e.id <> NEW.id;
      IF v_count >= v_limit THEN
        RAISE EXCEPTION 'plan limit reached: max_events'
          USING ERRCODE = 'P0001', HINT = 'plan_limit';
      END IF;
    END IF;
  END IF;

  IF v_enabling_gam AND NOT public.org_plan_feature(NEW.organization_id, 'gamification') THEN
    RAISE EXCEPTION 'feature not in plan: gamification'
      USING ERRCODE = 'P0001', HINT = 'plan_limit';
  END IF;

  IF v_enabling_lot
     AND NOT public.org_plan_feature(NEW.organization_id, 'gamification_rewards') THEN
    RAISE EXCEPTION 'feature not in plan: gamification_rewards'
      USING ERRCODE = 'P0001', HINT = 'plan_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_event_plan_limits ON public.events;
CREATE TRIGGER enforce_event_plan_limits
  BEFORE INSERT OR UPDATE OF status, deleted_at, organization_id,
    gamification_enabled, lottery_points_per_ticket
  ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_plan_limits();

-- ── attendees: max_attendees_per_event (odrzuceni się nie liczą) ──────────
CREATE OR REPLACE FUNCTION public.enforce_attendee_plan_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org   uuid;
  v_limit numeric;
  v_count bigint;
BEGIN
  IF NEW.status = 'rejected' THEN
    RETURN NEW;
  END IF;
  -- Zmiana statusu w obrębie liczonych (pending ↔ approved) nie zmienia liczby miejsc.
  IF TG_OP = 'UPDATE' AND OLD.status <> 'rejected' AND OLD.event_id = NEW.event_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.plan_limits_enforced() THEN
    RETURN NEW;
  END IF;

  SELECT e.organization_id INTO v_org FROM public.events e WHERE e.id = NEW.event_id;
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.org_plan_limit(v_org, 'max_attendees_per_event');
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('plan_max_attendees:' || NEW.event_id::text, 0));
  SELECT count(*) INTO v_count
  FROM public.attendees a
  WHERE a.event_id = NEW.event_id
    AND a.status <> 'rejected'
    AND a.id <> NEW.id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'plan limit reached: max_attendees_per_event'
      USING ERRCODE = 'P0001', HINT = 'plan_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_attendee_plan_limit ON public.attendees;
CREATE TRIGGER enforce_attendee_plan_limit
  BEFORE INSERT OR UPDATE OF status, event_id
  ON public.attendees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendee_plan_limit();

-- ── Uprawnienia: funkcje tylko dla triggerów (nie jako RPC) ────────────────
REVOKE ALL ON FUNCTION public.plan_limits_enforced() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_entitlement_sources(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_plan_feature(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_plan_limit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_event_plan_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_attendee_plan_limit() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
