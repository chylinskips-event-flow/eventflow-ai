-- „Wejdź ponownie” — limit żądań o link do panelu uczestnika. Idempotentna, kończy się NOTIFY pgrst.
--
-- Każde żądanie z formularza /e/{slug}/wejdz zapisuje jeden wiersz — NIEZALEŻNIE od tego, czy
-- adres jest zarejestrowany (inaczej sam limit zdradzałby istnienie rejestracji). Limit liczony
-- po hashach (SHA-256): surowego e-maila ani adresu IP tu nie przechowujemy.
-- Wiersze starsze niż doba aplikacja usuwa przy kolejnych żądaniach (dane czysto techniczne).
-- RLS deny-all (bez polityk): zapis i odczyt tylko service_role z akcji serwera.

CREATE TABLE IF NOT EXISTS public.attendee_access_link_requests (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email_hash  text        NOT NULL,
  ip_hash     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendee_access_link_requests_email_idx
  ON public.attendee_access_link_requests (email_hash, created_at);
CREATE INDEX IF NOT EXISTS attendee_access_link_requests_ip_idx
  ON public.attendee_access_link_requests (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS attendee_access_link_requests_created_idx
  ON public.attendee_access_link_requests (created_at);

ALTER TABLE public.attendee_access_link_requests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
