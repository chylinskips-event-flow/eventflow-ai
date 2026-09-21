-- EventFlow AI — bucket "partner-logos" dla logotypów partnerów.
-- Konwencja ścieżki: "<event_id>/<filename>" — jak event-logos i speaker-photos:
-- weryfikacja właściciela przez pierwszy segment ścieżki = event_id.

insert into storage.buckets (id, name, public)
values ('partner-logos', 'partner-logos', true)
on conflict (id) do nothing;

create policy "public can view partner logos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'partner-logos');

create policy "organizer can upload partner logo for own event"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'partner-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can replace partner logo for own event"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'partner-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'partner-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete partner logo for own event"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'partner-logos'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);
