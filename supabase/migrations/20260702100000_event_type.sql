-- EventFlow AI — typ wydarzenia (konferencja, targi, warsztaty...).
-- Bez CHECK — lista typów może ewoluować, walidacja po stronie formularza.

alter table public.events
  add column event_type text;
