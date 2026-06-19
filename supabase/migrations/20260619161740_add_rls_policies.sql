-- EventFlow AI — baseline RLS policies ("ostrożny punkt startowy")
--
-- service_role nie wymaga żadnych policy: klient z service_role key (np. supabase/admin.ts)
-- omija RLS całkowicie na poziomie Postgresa (bypassrls), niezależnie od tego, czy RLS jest
-- włączone na tabeli. To jest udokumentowane, wbudowane zachowanie Supabase/Postgres,
-- nie wymaga deklaracji `for service_role` w żadnej z poniższych polityk.

-- ============================================================================
-- 2. events — publiczny odczyt opublikowanych/trwających wydarzeń
-- ============================================================================
create policy "public can view published or live events"
on public.events
for select
to anon, authenticated
using (status in ('published', 'live'));

-- ============================================================================
-- 3. sessions, speakers, partners — publiczny odczyt, gdy event jest publiczny
-- ============================================================================
create policy "public can view sessions of published or live events"
on public.sessions
for select
to anon, authenticated
using (
  exists (
    select 1 from public.events
    where events.id = sessions.event_id
      and events.status in ('published', 'live')
  )
);

create policy "public can view speakers of published or live events"
on public.speakers
for select
to anon, authenticated
using (
  exists (
    select 1 from public.events
    where events.id = speakers.event_id
      and events.status in ('published', 'live')
  )
);

create policy "public can view partners of published or live events"
on public.partners
for select
to anon, authenticated
using (
  exists (
    select 1 from public.events
    where events.id = partners.event_id
      and events.status in ('published', 'live')
  )
);

-- ============================================================================
-- 4. polls — publiczny odczyt tylko otwartych ankiet na publicznym evencie
-- ============================================================================
create policy "public can view open polls of published or live events"
on public.polls
for select
to anon, authenticated
using (
  status = 'open'
  and exists (
    select 1 from public.events
    where events.id = polls.event_id
      and events.status in ('published', 'live')
  )
);

-- ============================================================================
-- 5. organizations — właściciel zarządza wyłącznie swoimi organizacjami
-- ============================================================================
create policy "authenticated can create own organization"
on public.organizations
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "owner can view own organization"
on public.organizations
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owner can update own organization"
on public.organizations
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- ============================================================================
-- 6. events — pełny CRUD dla organizatora będącego właścicielem organizacji
-- ============================================================================
create policy "organizer can insert events for own organization"
on public.events
for insert
to authenticated
with check (
  exists (
    select 1 from public.organizations
    where organizations.id = events.organization_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can view own events"
on public.events
for select
to authenticated
using (
  exists (
    select 1 from public.organizations
    where organizations.id = events.organization_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update own events"
on public.events
for update
to authenticated
using (
  exists (
    select 1 from public.organizations
    where organizations.id = events.organization_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organizations
    where organizations.id = events.organization_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete own events"
on public.events
for delete
to authenticated
using (
  exists (
    select 1 from public.organizations
    where organizations.id = events.organization_id
      and organizations.owner_user_id = auth.uid()
  )
);

-- ============================================================================
-- 7. speakers, sessions, partners — pełny CRUD dla organizatora będącego
--    właścicielem organizacji, do której należy powiązany event
-- ============================================================================
create policy "organizer can insert speakers for own events"
on public.speakers
for insert
to authenticated
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = speakers.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can view speakers of own events"
on public.speakers
for select
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = speakers.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update speakers of own events"
on public.speakers
for update
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = speakers.event_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = speakers.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete speakers of own events"
on public.speakers
for delete
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = speakers.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can insert partners for own events"
on public.partners
for insert
to authenticated
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = partners.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can view partners of own events"
on public.partners
for select
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = partners.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update partners of own events"
on public.partners
for update
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = partners.event_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = partners.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete partners of own events"
on public.partners
for delete
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = partners.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can insert sessions for own events"
on public.sessions
for insert
to authenticated
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = sessions.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can view sessions of own events"
on public.sessions
for select
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = sessions.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update sessions of own events"
on public.sessions
for update
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = sessions.event_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = sessions.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete sessions of own events"
on public.sessions
for delete
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = sessions.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

-- ============================================================================
-- 8. attendees — zablokowane dla anon/authenticated na tym etapie.
-- TODO: token-based access dla uczestnika zostanie dodany w Kroku 2.1,
-- kiedy zaimplementujemy rejestrację i logikę cookie.
-- Wyjątek: organizator może SELECT uczestników własnych eventów
-- (potrzebne do przyszłego panelu "lista uczestników").
-- ============================================================================
create policy "organizer can view attendees of own events"
on public.attendees
for select
to authenticated
using (
  exists (
    select 1 from public.events
    join public.organizations on organizations.id = events.organization_id
    where events.id = attendees.event_id
      and organizations.owner_user_id = auth.uid()
  )
);

-- ============================================================================
-- 9. Pozostałe tabele — całkowicie zablokowane dla anon/authenticated.
-- RLS jest już włączone (init_schema.sql) i bez żadnej policy domyślnie
-- odrzuca wszystkie żądania ról innych niż service_role, więc nie trzeba
-- tworzyć tu jawnych polityk "deny all" — to jest zachowanie domyślne.
-- Lista tabel do dopracowania w kolejnych krokach:
--   session_speakers, agenda_items, quests, quest_completions, questions,
--   question_votes, poll_answers, rewards, reward_redemptions, matches,
--   checkins, lead_consents, feedback, event_analytics_log
-- ============================================================================
