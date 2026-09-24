-- Push 5a: Business Mixer — Live Run
-- Extends mixer status enum, adds present_token, creates mixer_rounds table.

-- 1. Extend mixers.status constraint
alter table public.mixers drop constraint if exists mixers_status_check;
alter table public.mixers add constraint mixers_status_check
  check (status in ('draft','generated','locked','running','finished'));

-- 2. Add present_token for read-only projector screen (Push 5c)
alter table public.mixers
  add column if not exists present_token uuid default gen_random_uuid();

-- 3. mixer_rounds: tracks live-run state per round
create table public.mixer_rounds (
  id           uuid        primary key default gen_random_uuid(),
  mixer_id     uuid        not null references public.mixers(id) on delete cascade,
  round_number int         not null,
  status       text        not null default 'pending'
                             check (status in ('pending','active','done')),
  started_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (mixer_id, round_number)
);

alter table public.mixer_rounds enable row level security;
