-- EventFlow AI — bucket "event-logos" dla logotypów eventów.
-- Konwencja ścieżki: "<event_id>/<filename>" — pozwala to politykom poniżej
-- zweryfikować właściciela eventu na podstawie pierwszego segmentu ścieżki.

insert into storage.buckets (id, name, public)
values ('event-logos', 'event-logos', true)
on conflict (id) do nothing;

create policy "public can view event logos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'event-logos');

create policy "organizer can upload logo for own event"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can replace logo for own event"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'event-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete logo for own event"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);
