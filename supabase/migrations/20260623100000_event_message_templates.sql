-- EventFlow AI — szablony wiadomości email dla eventów.

create table public.event_message_templates (
  id            uuid        primary key default gen_random_uuid(),
  event_id      uuid        not null references public.events (id) on delete cascade,
  template_type text        not null,
  subject       text,
  body          text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint event_message_templates_template_type_check
    check (template_type in (
      'registration_confirmed',
      'registration_pending',
      'registration_approved',
      'registration_rejected',
      'welcome_approved',
      'welcome_pending'
    )),

  constraint event_message_templates_event_type_unique
    unique (event_id, template_type)
);

create index idx_event_message_templates_event_id
  on public.event_message_templates (event_id);

create trigger set_updated_at
  before update on public.event_message_templates
  for each row execute function public.set_updated_at();

alter table public.event_message_templates enable row level security;

-- Organizator: pełny CRUD dla szablonów własnych eventów.
-- Anon/authenticated bez polityk = domyślny deny (treść maili nie jest publiczna).

create policy "organizer can insert message templates for own events"
on public.event_message_templates
for insert
to authenticated
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_message_templates.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can view message templates for own events"
on public.event_message_templates
for select
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_message_templates.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update message templates for own events"
on public.event_message_templates
for update
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_message_templates.event_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_message_templates.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete message templates for own events"
on public.event_message_templates
for delete
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = event_message_templates.event_id
      and organizations.owner_user_id = auth.uid()
  )
);
