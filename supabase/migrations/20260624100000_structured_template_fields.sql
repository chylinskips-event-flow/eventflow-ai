-- EventFlow AI — strukturalny edytor szablonów wiadomości.

ALTER TABLE public.event_message_templates
  ADD COLUMN body_mode    text NOT NULL DEFAULT 'structured'
    CONSTRAINT event_message_templates_body_mode_check
      CHECK (body_mode IN ('structured', 'html')),
  ADD COLUMN body_heading text,
  ADD COLUMN body_main    text,
  ADD COLUMN body_footer  text;

-- Istniejące rekordy mają body wypełnione HTMLem z poprzednich testów.
-- body_mode DEFAULT 'structured' zostałby ustawiony retroaktywnie,
-- ale pola strukturalne są NULL — buildStructuredHtml zwróciłby pusty HTML.
-- Ustawiamy 'html' dla wszystkich istniejących rekordów.
UPDATE public.event_message_templates
SET body_mode = 'html';
