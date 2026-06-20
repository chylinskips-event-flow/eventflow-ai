-- EventFlow AI — bucket "speaker-photos" dla zdjęć prelegentów.
-- Konwencja ścieżki: "<event_id>/<filename>" — ta sama zasada co w event-logos:
-- weryfikacja właściciela przez pierwszy segment ścieżki = event_id.

insert into storage.buckets (id, name, public)
values ('speaker-photos', 'speaker-photos', true)
on conflict (id) do nothing;

create policy "public can view speaker photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'speaker-photos');

create policy "organizer can upload speaker photo for own event"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'speaker-photos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can replace speaker photo for own event"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'speaker-photos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'speaker-photos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete speaker photo for own event"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'speaker-photos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);
