-- #10 Faza A2 — zapotrzebowanie partnera na stoisko (logistyka).
-- Partner w panelu zgłasza ilości pozycji z katalogu organizatora (+ informacje o stoisku),
-- organizator zatwierdza / zmienia ilość / odrzuca per pozycja. Brak PII uczestników.
-- Idempotentna. Zastosować w Supabase PRZED / razem z deployem (kończy się NOTIFY pgrst).
--
-- RLS deny-all na wszystkich tabelach: dostęp wyłącznie przez server actions po autoryzacji
-- (organizator: getOwnEvent, partner: getPartnerContext) + service_role. Tabele mają własne
-- PK `id`; kaskady na usunięcie eventu / partnera (nauczka #11). Gating: istniejący feature
-- `partner_portal` — bez nowych kluczy w plans.features.

-- ── Ustawienia logistyki per event ─────────────────────────────────────────
-- request_deadline: po terminie wniosek tylko do odczytu („Poproś o zmianę”).
-- setup_* / teardown_*: dozwolony zakres godzin montażu i demontażu (opcjonalny).
-- catalog_seeded: domyślny katalog wstawiony raz (usunięcie wszystkich pozycji go nie przywraca).
CREATE TABLE IF NOT EXISTS public.booth_logistics_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  request_deadline timestamptz,
  setup_from       timestamptz,
  setup_to         timestamptz,
  teardown_from    timestamptz,
  teardown_to      timestamptz,
  catalog_seeded   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booth_logistics_settings_setup_range CHECK (setup_from IS NULL OR setup_to IS NULL OR setup_from < setup_to),
  CONSTRAINT booth_logistics_settings_teardown_range CHECK (teardown_from IS NULL OR teardown_to IS NULL OR teardown_from < teardown_to)
);
CREATE UNIQUE INDEX IF NOT EXISTS booth_logistics_settings_event_key ON public.booth_logistics_settings (event_id);
ALTER TABLE public.booth_logistics_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.booth_logistics_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.booth_logistics_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Katalog pozycji (organizator) ──────────────────────────────────────────
-- included_by_tier: liczba sztuk wliczona w pakiet per poziom partnera, np. {"gold":2,"silver":1}.
-- Brak klucza = brak limitu (pozycja nie jest oznaczana „ponad pakiet”).
CREATE TABLE IF NOT EXISTS public.booth_catalog_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  name             text NOT NULL,
  unit             text NOT NULL DEFAULT 'szt.',
  description      text,
  active           boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  included_by_tier jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booth_catalog_items_lengths CHECK (
    char_length(name) BETWEEN 1 AND 120
    AND char_length(unit) BETWEEN 1 AND 20
    AND coalesce(char_length(description), 0) <= 500
  ),
  CONSTRAINT booth_catalog_items_tier_object CHECK (jsonb_typeof(included_by_tier) = 'object')
);
CREATE INDEX IF NOT EXISTS booth_catalog_items_event_idx ON public.booth_catalog_items (event_id, sort_order);
ALTER TABLE public.booth_catalog_items ENABLE ROW LEVEL SECURITY;

-- ── Wniosek partnera (jeden na partnera) ───────────────────────────────────
-- late_change_at: zmiana złożona po terminie przez „Poproś o zmianę”.
CREATE TABLE IF NOT EXISTS public.partner_booth_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  crew_count      integer,
  setup_start     timestamptz,
  setup_end       timestamptz,
  teardown_start  timestamptz,
  teardown_end    timestamptz,
  vehicle         boolean NOT NULL DEFAULT false,
  vehicle_note    text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  submitted_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  late_change_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_booth_requests_crew CHECK (crew_count IS NULL OR crew_count BETWEEN 0 AND 500),
  CONSTRAINT partner_booth_requests_vehicle_note CHECK (coalesce(char_length(vehicle_note), 0) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_booth_requests_partner_key ON public.partner_booth_requests (partner_id);
CREATE INDEX IF NOT EXISTS partner_booth_requests_event_idx ON public.partner_booth_requests (event_id);
ALTER TABLE public.partner_booth_requests ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.partner_booth_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.partner_booth_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Pozycje wniosku ────────────────────────────────────────────────────────
-- catalog_item_id NULL = „Inne potrzeby” (tekst w note). label/unit = nazwa w chwili zgłoszenia.
-- FK bez kaskady (NO ACTION): pozycji używanej we wnioskach nie da się usunąć — aplikacja
-- ją wtedy dezaktywuje. Usunięcie eventu sprząta obie tabele w jednej instrukcji.
-- status: pending | approved | changed (zatwierdzona inna ilość: approved_qty) | rejected.
CREATE TABLE IF NOT EXISTS public.partner_booth_request_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES public.partner_booth_requests (id) ON DELETE CASCADE,
  partner_id      uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.booth_catalog_items (id),
  label           text NOT NULL,
  unit            text NOT NULL DEFAULT 'szt.',
  qty             integer NOT NULL,
  note            text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changed', 'rejected')),
  approved_qty    integer,
  decision_note   text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_booth_request_items_qty CHECK (qty BETWEEN 1 AND 999),
  CONSTRAINT partner_booth_request_items_approved_qty CHECK (approved_qty IS NULL OR approved_qty BETWEEN 0 AND 999),
  CONSTRAINT partner_booth_request_items_lengths CHECK (
    char_length(label) BETWEEN 1 AND 120
    AND coalesce(char_length(note), 0) <= 1000
    AND coalesce(char_length(decision_note), 0) <= 1000
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_booth_request_items_catalog_key
  ON public.partner_booth_request_items (request_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_booth_request_items_custom_key
  ON public.partner_booth_request_items (request_id) WHERE catalog_item_id IS NULL;
CREATE INDEX IF NOT EXISTS partner_booth_request_items_event_idx ON public.partner_booth_request_items (event_id);
CREATE INDEX IF NOT EXISTS partner_booth_request_items_partner_idx ON public.partner_booth_request_items (partner_id);
ALTER TABLE public.partner_booth_request_items ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.partner_booth_request_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.partner_booth_request_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
