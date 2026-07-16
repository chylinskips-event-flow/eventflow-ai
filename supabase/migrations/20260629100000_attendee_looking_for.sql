-- EventFlow AI — "czego szukam na tym evencie" (swobodny tekst uczestnika).
-- Limit 200 znaków egzekwowany w aplikacji, świadomie bez CHECK w bazie
-- (prościej; walidacja i tak jest przy zapisie formularza).

alter table public.attendees
  add column looking_for text;
