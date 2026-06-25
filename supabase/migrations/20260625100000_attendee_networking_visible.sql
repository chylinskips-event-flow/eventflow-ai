-- EventFlow AI — widoczność uczestnika na liście networkingowej.
-- Domyślnie każdy uczestnik jest widoczny; można to później wyłączyć
-- (np. opt-out z poziomu uczestnika lub moderacja przez organizatora).

alter table public.attendees
  add column networking_visible boolean not null default true;
