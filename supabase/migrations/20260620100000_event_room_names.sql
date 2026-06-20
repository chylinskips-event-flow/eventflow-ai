-- EventFlow AI — lista nazw sal dla eventu (bez nowej tabeli).
-- Używana w formularzu sesji jako lista wyboru dla pola "Sala".

alter table public.events
  add column room_names text[] default '{}'::text[];
