-- Wydawanie posiłków po bilecie QR (lunch, kolacja). Idempotentna, kończy się NOTIFY pgrst.
-- SZKIC DO PRZEGLĄDU — nie uruchamiać bez zgody właściciela.
--
-- Posiłek ma własny link obsługi (osobny od recepcji: obsługa lokalu nie melduje uczestników).
-- Jeden bilet = jedno wydanie na posiłek; pilnuje tego unikalny indeks, więc dwa równoczesne
-- skany tego samego kodu nie policzą się podwójnie.
-- Usunięcie uczestnika zeruje attendee_id: dane osobowe znikają, a liczba wydanych posiłków
-- do rozliczenia z lokalem zostaje.
-- Obie tabele: RLS deny-all (bez polityk) — zapis i odczyt tylko service_role z akcji serwera.

CREATE TABLE IF NOT EXISTS public.event_meals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  access_token text        DEFAULT gen_random_uuid()::text,  -- NULL = link obsługi wyłączony
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_meals_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS event_meals_event_idx ON public.event_meals (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS event_meals_access_token_key
  ON public.event_meals (access_token) WHERE access_token IS NOT NULL;
ALTER TABLE public.event_meals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.meal_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id     uuid        NOT NULL REFERENCES public.event_meals(id) ON DELETE CASCADE,
  attendee_id uuid        REFERENCES public.attendees(id) ON DELETE SET NULL,
  redeemed_by text        NOT NULL,                          -- organizer | staff
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_redemptions_by CHECK (redeemed_by IN ('organizer', 'staff'))
);
CREATE UNIQUE INDEX IF NOT EXISTS meal_redemptions_meal_attendee_key
  ON public.meal_redemptions (meal_id, attendee_id);
ALTER TABLE public.meal_redemptions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
