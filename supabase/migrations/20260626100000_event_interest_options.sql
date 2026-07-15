-- EventFlow AI — lista zainteresowań definiowana przez organizatora (bez nowej tabeli).
-- Analogicznie do room_names (text[]) w formularzu sesji, ale NULLABLE BEZ
-- DEFAULTU: NULL oznacza "nie skonfigurowano -> użyj domyślnej, zahardkodowanej
-- listy" w formularzu rejestracji. Pusta tablica '{}' znaczyłaby co innego
-- (organizator celowo wyłączył zainteresowania), dlatego nie ustawiamy defaultu.

alter table public.events
  add column interest_options text[];
