-- Import gości przez organizatora i wysyłka biletów. Idempotentna, kończy się NOTIFY pgrst.
-- SZKIC DO PRZEGLĄDU — nie uruchamiać bez zgody właściciela.
--
-- imported_at: gość dodany z listy organizatora (NULL = zapisał się sam i dostał już mail).
-- ticket_sent_at: kiedy wysłano bilet z panelu. Kolejka wysyłki = imported_at ustawione,
-- ticket_sent_at puste, więc samodzielnie zarejestrowani nie dostaną drugiego maila.

ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS imported_at    timestamptz,
  ADD COLUMN IF NOT EXISTS ticket_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS attendees_ticket_queue_idx
  ON public.attendees (event_id)
  WHERE imported_at IS NOT NULL AND ticket_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';
