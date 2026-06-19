-- EventFlow AI — initial schema
-- Creates all core tables, indexes, updated_at triggers, and enables RLS
-- (without policies — policies are added in a separate migration).

-- ============================================================================
-- Generic updated_at trigger function
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. organizations
-- ============================================================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references auth.users (id),
  plan text not null default 'trial',
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_organizations_owner_user_id on public.organizations (owner_user_id);

create trigger set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. events
-- ============================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  slug text not null unique,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'live', 'completed', 'archived')),
  logo_url text,
  primary_color text,
  location text,
  registration_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_events_organization_id on public.events (organization_id);
create index idx_events_status on public.events (status);

create trigger set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. attendees
-- ============================================================================
create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  first_name text,
  last_name text,
  email text,
  company text,
  job_title text,
  industry text,
  interests text[],
  goal text,
  gdpr_consent_at timestamptz,
  marketing_consent boolean not null default false,
  points integer not null default 0,
  level text not null default 'explorer',
  qr_code_token text not null unique default gen_random_uuid()::text,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_attendees_event_id on public.attendees (event_id);
create index idx_attendees_email on public.attendees (email);
create index idx_attendees_qr_code_token on public.attendees (qr_code_token);

create trigger set_updated_at
  before update on public.attendees
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. speakers
-- ============================================================================
create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid references auth.users (id),
  first_name text,
  last_name text,
  bio text,
  photo_url text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_speakers_event_id on public.speakers (event_id);
create index idx_speakers_user_id on public.speakers (user_id);

create trigger set_updated_at
  before update on public.speakers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. sessions
-- ============================================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  title text not null,
  description text,
  track text,
  room text,
  starts_at timestamptz,
  ends_at timestamptz,
  speaker_id uuid references public.speakers (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sessions_event_id on public.sessions (event_id);
create index idx_sessions_speaker_id on public.sessions (speaker_id);

create trigger set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 6. session_speakers
-- ============================================================================
create table public.session_speakers (
  session_id uuid not null references public.sessions (id),
  speaker_id uuid not null references public.speakers (id),
  primary key (session_id, speaker_id)
);

create index idx_session_speakers_session_id on public.session_speakers (session_id);
create index idx_session_speakers_speaker_id on public.session_speakers (speaker_id);

-- ============================================================================
-- 7. agenda_items
-- ============================================================================
create table public.agenda_items (
  attendee_id uuid not null references public.attendees (id),
  session_id uuid not null references public.sessions (id),
  added_at timestamptz not null default now(),
  primary key (attendee_id, session_id)
);

create index idx_agenda_items_attendee_id on public.agenda_items (attendee_id);
create index idx_agenda_items_session_id on public.agenda_items (session_id);

-- ============================================================================
-- 8. partners
-- ============================================================================
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid references auth.users (id),
  name text not null,
  logo_url text,
  description text,
  tier text,
  booth_location text,
  qr_code_token text not null unique default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_partners_event_id on public.partners (event_id);
create index idx_partners_user_id on public.partners (user_id);
create index idx_partners_qr_code_token on public.partners (qr_code_token);

create trigger set_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 9. quests
-- ============================================================================
create table public.quests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  partner_id uuid references public.partners (id),
  title text not null,
  description text,
  type text not null
    check (type in ('networking', 'session', 'partner', 'poll', 'custom')),
  points_value integer,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_quests_event_id on public.quests (event_id);
create index idx_quests_partner_id on public.quests (partner_id);

create trigger set_updated_at
  before update on public.quests
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 10. quest_completions
-- ============================================================================
create table public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id),
  attendee_id uuid not null references public.attendees (id),
  completed_at timestamptz not null default now(),
  points_awarded integer,
  created_at timestamptz not null default now(),
  unique (quest_id, attendee_id)
);

create index idx_quest_completions_quest_id on public.quest_completions (quest_id);
create index idx_quest_completions_attendee_id on public.quest_completions (attendee_id);

-- ============================================================================
-- 11. questions
-- ============================================================================
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id),
  attendee_id uuid not null references public.attendees (id),
  content text not null,
  status text not null default 'pending'
    check (status in ('pending', 'selected', 'answered', 'hidden')),
  vote_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_questions_session_id on public.questions (session_id);
create index idx_questions_attendee_id on public.questions (attendee_id);

-- ============================================================================
-- 12. question_votes
-- ============================================================================
create table public.question_votes (
  question_id uuid not null references public.questions (id),
  attendee_id uuid not null references public.attendees (id),
  created_at timestamptz not null default now(),
  primary key (question_id, attendee_id)
);

create index idx_question_votes_question_id on public.question_votes (question_id);
create index idx_question_votes_attendee_id on public.question_votes (attendee_id);

-- ============================================================================
-- 13. polls
-- ============================================================================
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id),
  event_id uuid not null references public.events (id),
  question text not null,
  options jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_polls_session_id on public.polls (session_id);
create index idx_polls_event_id on public.polls (event_id);

-- ============================================================================
-- 14. poll_answers
-- ============================================================================
create table public.poll_answers (
  poll_id uuid not null references public.polls (id),
  attendee_id uuid not null references public.attendees (id),
  selected_option_id text,
  created_at timestamptz not null default now(),
  primary key (poll_id, attendee_id)
);

create index idx_poll_answers_poll_id on public.poll_answers (poll_id);
create index idx_poll_answers_attendee_id on public.poll_answers (attendee_id);

-- ============================================================================
-- 15. rewards
-- ============================================================================
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  name text not null,
  description text,
  points_required integer not null,
  stock integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rewards_event_id on public.rewards (event_id);

-- ============================================================================
-- 16. reward_redemptions
-- ============================================================================
create table public.reward_redemptions (
  reward_id uuid not null references public.rewards (id),
  attendee_id uuid not null references public.attendees (id),
  redeemed_at timestamptz not null default now(),
  primary key (reward_id, attendee_id)
);

create index idx_reward_redemptions_reward_id on public.reward_redemptions (reward_id);
create index idx_reward_redemptions_attendee_id on public.reward_redemptions (attendee_id);

-- ============================================================================
-- 17. matches
-- ============================================================================
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  attendee_a_id uuid not null references public.attendees (id),
  attendee_b_id uuid not null references public.attendees (id),
  reason text,
  suggested_question text,
  status text not null default 'suggested'
    check (status in ('suggested', 'met', 'dismissed')),
  met_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attendee_a_id <> attendee_b_id)
);

create index idx_matches_event_id on public.matches (event_id);
create index idx_matches_attendee_a_id on public.matches (attendee_a_id);
create index idx_matches_attendee_b_id on public.matches (attendee_b_id);

-- ============================================================================
-- 18. checkins
-- ============================================================================
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.attendees (id),
  partner_id uuid not null references public.partners (id),
  checked_in_at timestamptz not null default now(),
  lead_consent_given boolean not null default false,
  created_at timestamptz not null default now(),
  unique (attendee_id, partner_id)
);

create index idx_checkins_attendee_id on public.checkins (attendee_id);
create index idx_checkins_partner_id on public.checkins (partner_id);

-- ============================================================================
-- 19. lead_consents
-- ============================================================================
create table public.lead_consents (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins (id),
  consent_text_version text,
  consented_at timestamptz not null default now(),
  ip_address inet,
  created_at timestamptz not null default now()
);

create index idx_lead_consents_checkin_id on public.lead_consents (checkin_id);

-- ============================================================================
-- 20. feedback
-- ============================================================================
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id),
  attendee_id uuid not null references public.attendees (id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (session_id, attendee_id)
);

create index idx_feedback_session_id on public.feedback (session_id);
create index idx_feedback_attendee_id on public.feedback (attendee_id);

-- ============================================================================
-- 21. event_analytics_log
-- ============================================================================
create table public.event_analytics_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  attendee_id uuid references public.attendees (id),
  action_type text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_event_analytics_log_event_id on public.event_analytics_log (event_id);
create index idx_event_analytics_log_attendee_id on public.event_analytics_log (attendee_id);

-- ============================================================================
-- Row Level Security — enabled on all tables, policies added separately.
-- ============================================================================
alter table public.organizations enable row level security;
alter table public.events enable row level security;
alter table public.attendees enable row level security;
alter table public.speakers enable row level security;
alter table public.sessions enable row level security;
alter table public.session_speakers enable row level security;
alter table public.agenda_items enable row level security;
alter table public.partners enable row level security;
alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.questions enable row level security;
alter table public.question_votes enable row level security;
alter table public.polls enable row level security;
alter table public.poll_answers enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.matches enable row level security;
alter table public.checkins enable row level security;
alter table public.lead_consents enable row level security;
alter table public.feedback enable row level security;
alter table public.event_analytics_log enable row level security;
