-- EventFlow AI — sekcje treści strony eventu (banner + bloki tekst/zdjęcie).

alter table public.events
  add column banner_url text;

create table public.event_content_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  body text not null,
  image_url text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_content_sections_event_id
  on public.event_content_sections (event_id);

create trigger set_updated_at
  before update on public.event_content_sections
  for each row execute function public.set_updated_at();

alter table public.event_content_sections enable row level security;

-- Organizator: pełny CRUD dla sekcji własnych eventów.
create policy "organizer can insert content sections for own events"
on public.event_content_sections
for insert
to authenticated
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_content_sections.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can view content sections of own events"
on public.event_content_sections
for select
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_content_sections.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update content sections of own events"
on public.event_content_sections
for update
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_content_sections.event_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_content_sections.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete content sections of own events"
on public.event_content_sections
for delete
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_content_sections.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

-- Publiczny odczyt: tylko gdy powiązany event jest published/live.
create policy "public can view content sections of published or live events"
on public.event_content_sections
for select
to anon, authenticated
using (
  exists (
    select 1 from public.events
    where events.id = event_content_sections.event_id
      and events.status in ('published', 'live')
  )
);

-- Storage: bucket "event-content" dla bannerów eventu i zdjęć sekcji treści.
-- Konwencja ścieżki: "<event_id>/<filename>" — ta sama zasada co event-logos.

insert into storage.buckets (id, name, public)
values ('event-content', 'event-content', true)
on conflict (id) do nothing;

create policy "public can view event content images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'event-content');

create policy "organizer can upload event content for own event"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-content'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can replace event content for own event"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-content'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'event-content'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete event content for own event"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-content'
  and exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id::text = (storage.foldername(storage.objects.name))[1]
      and organizations.owner_user_id = auth.uid()
  )
);
