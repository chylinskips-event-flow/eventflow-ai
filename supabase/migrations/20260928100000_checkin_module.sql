-- Moduł recepcji/check-in: checked_in_by + check_in_token na uczestnikach,
-- reception_token na wydarzeniach.
-- Pole checked_in_at już istnieje w schemacie (wcześniejsza migracja).

ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS checked_in_by text null,
  ADD COLUMN IF NOT EXISTS check_in_token text NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX IF NOT EXISTS attendees_check_in_token_idx
  ON public.attendees(check_in_token);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reception_token text null;

CREATE UNIQUE INDEX IF NOT EXISTS events_reception_token_idx
  ON public.events(reception_token)
  WHERE reception_token IS NOT NULL;
