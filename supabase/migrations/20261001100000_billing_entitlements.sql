-- Billing platformy — Faza A: plany, subskrypcje, override'y uprawnień.
-- Idempotentna. RLS deny-all: dostęp wyłącznie przez service_role, uprawnienia
-- liczone serwerowo (src/lib/entitlements.ts). Gating działa tylko przy BILLING_ENABLED=true.

-- ── Plany ────────────────────────────────────────────────────────────────
-- features: { "<feature_key>": true|false }      (brak klucza = false)
-- limits:   { "<limit_key>": <liczba> | null }   (null / brak klucza = bez limitu)
-- Ceny, limity i mapowanie na Stripe trzymane tutaj — zmiana bez deploya (UPDATE).
CREATE TABLE IF NOT EXISTS public.plans (
  key                  text PRIMARY KEY,
  name                 text NOT NULL,
  sort_order           integer NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  features             jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits               jsonb NOT NULL DEFAULT '{}'::jsonb,
  support_level        text,             -- none / standard / priority / dedicated (informacyjnie)
  price_net_per_event  integer,          -- grosze netto; NULL = wycena indywidualna / do ustalenia
  price_net_yearly     integer,          -- grosze netto, wariant „roczny unlimited"; NULL = brak
  currency             text NOT NULL DEFAULT 'PLN',
  trial_days           integer NOT NULL DEFAULT 14,
  stripe_product_id    text,             -- Faza B
  stripe_price_id      text,             -- Faza B (cena per event)
  stripe_price_yearly_id text,           -- Faza B (wariant roczny)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Wartości DOMYŚLNE z Eventro_Plany_konfiguracja.md (2026-10-01) — propozycja, nie ostateczne.
-- Placeholdery do decyzji właściciela: ceny (dolne widełki), max_events, prowizje (środek widełek).
-- Wstawiane tylko, jeśli planu jeszcze nie ma (ręczne zmiany w bazie nie są nadpisywane).
INSERT INTO public.plans (key, name, sort_order, features, limits, support_level, price_net_per_event, price_net_yearly) VALUES
  ('free', 'Free', 0,
    '{"registration":true,"reception_checkin":true,"tickets_free":true,
      "page_builder":false,"subdomains":false,"tickets_paid":false,"badges":false,
      "gamification":false,"gamification_rewards":false,"business_mixer":false,
      "photo_gallery":false,"ai_support":false,"custom_domain":false,"white_label":false,
      "sso":false,"api":false,"multi_edition":false}',
    '{"max_attendees_per_event":75,"max_events":2,"ticket_commission_pct":4}',
    'none', 0, NULL),
  ('pro', 'Pro', 10,
    '{"registration":true,"reception_checkin":true,"tickets_free":true,
      "page_builder":true,"subdomains":true,"tickets_paid":true,"badges":true,
      "gamification":true,"gamification_rewards":false,"business_mixer":false,
      "photo_gallery":false,"ai_support":false,"custom_domain":false,"white_label":false,
      "sso":false,"api":false,"multi_edition":false}',
    '{"max_attendees_per_event":300,"max_events":null,"ticket_commission_pct":2.5}',
    'standard', 99000, NULL),
  ('business', 'Business', 20,
    '{"registration":true,"reception_checkin":true,"tickets_free":true,
      "page_builder":true,"subdomains":true,"tickets_paid":true,"badges":true,
      "gamification":true,"gamification_rewards":true,"business_mixer":true,
      "photo_gallery":true,"ai_support":false,"custom_domain":false,"white_label":false,
      "sso":false,"api":false,"multi_edition":false}',
    '{"max_attendees_per_event":null,"max_events":null,"ticket_commission_pct":1.5}',
    'priority', 290000, NULL),
  ('enterprise', 'Enterprise', 30,
    '{"registration":true,"reception_checkin":true,"tickets_free":true,
      "page_builder":true,"subdomains":true,"tickets_paid":true,"badges":true,
      "gamification":true,"gamification_rewards":true,"business_mixer":true,
      "photo_gallery":true,"ai_support":false,"custom_domain":true,"white_label":true,
      "sso":true,"api":true,"multi_edition":true}',
    '{"max_attendees_per_event":null,"max_events":null,"ticket_commission_pct":null}',
    'dedicated', NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ── Subskrypcje (1 na organizację) ────────────────────────────────────────
-- Źródło prawdy dla planu kupionego przez Stripe (Faza B: aktualizowane webhookami).
CREATE TABLE IF NOT EXISTS public.subscriptions (
  organization_id        uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_key               text NOT NULL REFERENCES public.plans(key),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('trialing','active','past_due','canceled','incomplete','unpaid')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  trial_ends_at          timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text UNIQUE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Override'y uprawnień per organizacja ─────────────────────────────────
-- Grandfathering pilotów i ręczne wyjątki (przyszły panel super-admina = UI nad tą tabelą).
-- Osobno od subscriptions, żeby webhooki Stripe nigdy ich nie nadpisały.
--   plan_key: wymuszony plan (np. 'enterprise' dla pilota) — ma pierwszeństwo przed subskrypcją
--   features / limits: punktowe nadpisania na wierzchu planu
CREATE TABLE IF NOT EXISTS public.entitlement_overrides (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_key        text REFERENCES public.plans(key),
  features        jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits          jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason          text,
  expires_at      timestamptz,          -- NULL = bezterminowo
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.entitlement_overrides;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.entitlement_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';

-- ── Grandfathering pilotów (Faza C — URUCHOMIĆ RĘCZNIE przed BILLING_ENABLED=true) ──
-- Nadaje istniejącym organizacjom plan Business bezterminowo i prowizję 0%.
-- INSERT INTO public.entitlement_overrides (organization_id, plan_key, limits, reason)
-- SELECT id, 'business', '{"ticket_commission_pct":0}'::jsonb, 'pilot — grandfathering'
-- FROM public.organizations
-- ON CONFLICT (organization_id) DO NOTHING;
