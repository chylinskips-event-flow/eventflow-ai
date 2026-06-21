-- EventFlow AI — opcjonalna moderacja rejestracji uczestników.

alter table public.events
  add column requires_approval boolean not null default false;

alter table public.attendees
  add column status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected'));

-- Brakująca dotąd polityka: organizator musiał mieć możliwość UPDATE
-- statusu uczestnika własnego eventu (istniała tylko polityka SELECT).
create policy "organizer can update attendees of own events"
on public.attendees
for update
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = attendees.event_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = attendees.event_id
      and organizations.owner_user_id = auth.uid()
  )
);
