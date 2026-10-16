-- #10 Faza A2 — poprawki: okna montażu/demontażu (dzień + zakres godzin, krok wyboru)
-- i dane pojazdu (numer rejestracyjny, typ). Idempotentna; kończy się NOTIFY pgrst.
--
-- Okna trzymamy jako jsonb w strefie wydarzenia: [{"date":"2026-11-17","from":"14:00","to":"20:00"}, …].
-- Partner wybiera dzień z okna i godziny co slot_step_minutes; wybór zapisujemy jak dotąd
-- w partner_booth_requests.setup_start/_end, teardown_start/_end (timestamptz).
-- Stare pełne zakresy setup_from/_to, teardown_from/_to zastąpione oknami — usuwamy.
-- Numer rejestracyjny: dane osobowe w niektórych kontekstach — tylko organizator i dany partner
-- (RLS deny-all jak cała A2), bez logowania w aplikacji.

ALTER TABLE public.booth_logistics_settings
  ADD COLUMN IF NOT EXISTS setup_windows      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS teardown_windows   jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS slot_step_minutes  integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS require_vehicle_plate boolean NOT NULL DEFAULT false;

ALTER TABLE public.booth_logistics_settings
  DROP CONSTRAINT IF EXISTS booth_logistics_settings_setup_range,
  DROP CONSTRAINT IF EXISTS booth_logistics_settings_teardown_range,
  DROP COLUMN IF EXISTS setup_from,
  DROP COLUMN IF EXISTS setup_to,
  DROP COLUMN IF EXISTS teardown_from,
  DROP COLUMN IF EXISTS teardown_to;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booth_logistics_settings_windows_array') THEN
    ALTER TABLE public.booth_logistics_settings
      ADD CONSTRAINT booth_logistics_settings_windows_array
        CHECK (jsonb_typeof(setup_windows) = 'array' AND jsonb_typeof(teardown_windows) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booth_logistics_settings_slot_step') THEN
    ALTER TABLE public.booth_logistics_settings
      ADD CONSTRAINT booth_logistics_settings_slot_step CHECK (slot_step_minutes IN (15, 30, 60));
  END IF;
END $$;

-- Wniosek: orientacyjne godziny (gdy organizator nie ustawił okna), pojazd, flaga „do poprawy”
-- (godziny poza oknem po zmianie okien przez organizatora).
ALTER TABLE public.partner_booth_requests
  ADD COLUMN IF NOT EXISTS setup_note       text,
  ADD COLUMN IF NOT EXISTS teardown_note    text,
  ADD COLUMN IF NOT EXISTS vehicle_plate    text,
  ADD COLUMN IF NOT EXISTS vehicle_type     text,
  ADD COLUMN IF NOT EXISTS times_need_fix   boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_booth_requests_vehicle_fields') THEN
    ALTER TABLE public.partner_booth_requests
      ADD CONSTRAINT partner_booth_requests_vehicle_fields CHECK (
        coalesce(char_length(vehicle_plate), 0) <= 15
        AND (vehicle_type IS NULL OR vehicle_type IN ('car', 'van', 'truck'))
        AND coalesce(char_length(setup_note), 0) <= 200
        AND coalesce(char_length(teardown_note), 0) <= 200
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
