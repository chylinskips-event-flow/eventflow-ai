-- EventFlow AI — wielu prelegentów na sesję: rola (moderator dla paneli
-- dyskusyjnych) i kolejność wyświetlania. Zastępuje sessions.speaker_id (1:1).
--
-- UWAGA: tabela session_speakers ISTNIEJE od init_schema (Etap 0) w wersji
-- minimalnej (session_id, speaker_id, PK) — bez roli, kolejności i kaskad,
-- oraz bez polityk RLS (RLS włączone => domyślny deny-all dla
-- anon/authenticated). Ta migracja ją DOPEŁNIA, nie tworzy.
--
-- Twarde przejście: po przeniesieniu danych DROP COLUMN sessions.speaker_id.
-- Zostawienie kolumny obok tabeli = dwa źródła prawdy i gwarantowana przyszła
-- niespójność. Kod i migracja idą w jednym deployu.

-- 1. Rola i kolejność
alter table public.session_speakers
  add column role text not null default 'speaker'
    check (role in ('speaker', 'moderator')),
  add column position integer not null default 0;

-- 2. Kaskady — init_schema tworzył FK bez ON DELETE CASCADE, więc usunięcie
--    sesji lub prelegenta blokowałoby się na przypisaniach.
alter table public.session_speakers
  drop constraint session_speakers_session_id_fkey,
  add constraint session_speakers_session_id_fkey
    foreign key (session_id) references public.sessions (id) on delete cascade;

alter table public.session_speakers
  drop constraint session_speakers_speaker_id_fkey,
  add constraint session_speakers_speaker_id_fkey
    foreign key (speaker_id) references public.speakers (id) on delete cascade;

-- Indeks idx_session_speakers_speaker_id już istnieje (init_schema) — pomijamy.

-- 3. Przeniesienie istniejących przypisań z sessions.speaker_id
insert into public.session_speakers (session_id, speaker_id, role, position)
select id, speaker_id, 'speaker', 0
from public.sessions
where speaker_id is not null
on conflict (session_id, speaker_id) do nothing;

-- 4. Usunięcie starego źródła prawdy (indeks idx_sessions_speaker_id znika
--    razem z kolumną).
alter table public.sessions
  drop column speaker_id;

-- 5. RLS — te same zasady co sessions, przez join session_speakers -> sessions -> events.
create policy "public can view session speakers of published or live events"
on public.session_speakers
for select
to anon, authenticated
using (
  exists (
    select 1 from public.sessions
    join public.events on events.id = sessions.event_id
    where sessions.id = session_speakers.session_id
      and events.status in ('published', 'live')
  )
);

create policy "organizer can view session speakers of own events"
on public.session_speakers
for select
to authenticated
using (
  exists (
    select 1 from public.sessions
    join public.events on events.id = sessions.event_id
    join public.organizations on organizations.id = events.organization_id
    where sessions.id = session_speakers.session_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can insert session speakers for own events"
on public.session_speakers
for insert
to authenticated
with check (
  exists (
    select 1 from public.sessions
    join public.events on events.id = sessions.event_id
    join public.organizations on organizations.id = events.organization_id
    where sessions.id = session_speakers.session_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can update session speakers of own events"
on public.session_speakers
for update
to authenticated
using (
  exists (
    select 1 from public.sessions
    join public.events on events.id = sessions.event_id
    join public.organizations on organizations.id = events.organization_id
    where sessions.id = session_speakers.session_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions
    join public.events on events.id = sessions.event_id
    join public.organizations on organizations.id = events.organization_id
    where sessions.id = session_speakers.session_id
      and organizations.owner_user_id = auth.uid()
  )
);

create policy "organizer can delete session speakers of own events"
on public.session_speakers
for delete
to authenticated
using (
  exists (
    select 1 from public.sessions
    join public.events on events.id = sessions.event_id
    join public.organizations on organizations.id = events.organization_id
    where sessions.id = session_speakers.session_id
      and organizations.owner_user_id = auth.uid()
  )
);
