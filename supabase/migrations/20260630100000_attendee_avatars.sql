-- EventFlow AI — avatar uczestnika: kolumna + bucket Storage.

alter table public.attendees
  add column avatar_url text;

-- Bucket na avatary. Public read (widoczne na liście networkingowej).
-- Konwencja ścieżki: "<event_id>/<attendee_id>.<ext>" — avatary pogrupowane
-- per event, łatwiejsze porządkowanie.
insert into storage.buckets (id, name, public)
values ('attendee-avatars', 'attendee-avatars', true)
on conflict (id) do nothing;

-- Publiczny odczyt (avatary na liście uczestników).
create policy "public can view attendee avatars"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'attendee-avatars');

-- Brak polityk INSERT/UPDATE/DELETE dla anon/authenticated — CELOWO.
-- Upload/zmiana/usuwanie idzie WYŁĄCZNIE przez Server Action z service_role
-- (uczestnik nie ma konta auth; tożsamość ustalona z cookie po stronie
-- serwera). service_role omija RLS, więc polityka zapisu jest zbędna, a jej
-- brak gwarantuje, że anon/authenticated nie mogą pisać do bucketu.
