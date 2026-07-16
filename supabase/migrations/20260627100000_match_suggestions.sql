-- EventFlow AI — cache kierunkowych sugestii dopasowań (rule-based scoring).
-- Osobno od matches (symetryczna relacja + status met/dismissed) — to jest
-- REGENEROWALNY cache: score liczony regułami, reason dogenerowany później
-- przez LLM (NULL dopóki nie wygenerowany).

create table public.match_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  suggested_attendee_id uuid not null references public.attendees (id) on delete cascade,
  score integer not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (event_id, attendee_id, suggested_attendee_id),
  check (attendee_id <> suggested_attendee_id)
);

create index idx_match_suggestions_event_attendee
  on public.match_suggestions (event_id, attendee_id);

-- RLS włączone bez polityk publicznych: odczyt/zapis idzie przez service_role
-- (tożsamość uczestnika ustalona server-side, jak reszta danych networkingu).
alter table public.match_suggestions enable row level security;
