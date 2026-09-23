-- Business Mixer — 4 tabele + RLS deny-all (service_role omija RLS)

-- 1. mixers
create table public.mixers (
  id                uuid        primary key default gen_random_uuid(),
  event_id          uuid        not null references public.events(id) on delete cascade,
  name              text        not null,
  status            text        not null default 'draft'
                                  check (status in ('draft', 'generated', 'locked')),
  rounds_count      int         not null default 4,
  break_after_round int,                              -- null = brak przerwy
  round_minutes     int         not null default 20,
  break_minutes     int         not null default 10,
  table_count       int         not null default 8,
  seat_min          int         not null default 4,
  seat_max          int         not null default 6,
  seed              bigint      not null default floor(random() * 2147483647),
  quality           jsonb,                            -- metryki ostatniej generacji
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.mixers enable row level security;

-- 2. mixer_participants
--    attendee_id nullable + on delete set null: snapshot (display_name/company)
--    przeżywa usunięcie uczestnika; wiersz zostaje jako 'dropped' w planie.
create table public.mixer_participants (
  id           uuid        primary key default gen_random_uuid(),
  mixer_id     uuid        not null references public.mixers(id) on delete cascade,
  attendee_id  uuid                 references public.attendees(id) on delete set null,
  display_name text        not null,
  company      text,
  status       text        not null default 'active'
                              check (status in ('active', 'absent', 'dropped')),
  created_at   timestamptz not null default now(),
  unique (mixer_id, attendee_id)   -- NULL != NULL w Postgres, więc brak fałszywych konfliktów po usunięciu
);
alter table public.mixer_participants enable row level security;

-- 3. mixer_assignments
create table public.mixer_assignments (
  id             uuid        primary key default gen_random_uuid(),
  mixer_id       uuid        not null references public.mixers(id) on delete cascade,
  round_number   int         not null,
  table_number   int         not null,
  participant_id uuid        not null references public.mixer_participants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (mixer_id, round_number, participant_id)  -- 1 stolik na rundę
);
create index on public.mixer_assignments (mixer_id, round_number, table_number);
alter table public.mixer_assignments enable row level security;

-- 4. mixer_icebreakers
create table public.mixer_icebreakers (
  id           uuid        primary key default gen_random_uuid(),
  mixer_id     uuid        not null references public.mixers(id) on delete cascade,
  round_number int         not null,
  table_number int         not null,
  question     text        not null,
  is_custom    bool        not null default false,
  created_at   timestamptz not null default now(),
  unique (mixer_id, round_number, table_number)
);
alter table public.mixer_icebreakers enable row level security;
