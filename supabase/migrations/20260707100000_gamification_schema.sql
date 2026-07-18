-- EventFlow AI — schemat modułu grywalizacji (quizy przy stoiskach, zadania
-- networkingowe, punkty, nagrody, loteria). Dopasowanie istniejących szkieletów
-- z init_schema + nowa tabela quiz_attempts.
--
-- Zakres kaskad: uzupełniamy kaskady WEWNĄTRZ grywalizacji (usunięcie questa,
-- partnera, nagrody czyści dzieci). Kaskady od strony attendees domknięto już
-- przy RODO (20260706100000). FK ...event_id -> events celowo BEZ zmian: nie ma
-- flow usuwania eventu, a jego dodanie wymagałoby osobnego, szerokiego przejścia.

-- ============================================================================
-- events — przełączniki modułu grywalizacji (per event)
-- ============================================================================
-- gamification_enabled = false: zero UI grywalizacji u uczestnika.
-- lottery_points_per_ticket = NULL: loteria wyłączona; N = N punktów -> 1 los.
alter table public.events
  add column gamification_enabled boolean not null default false,
  add column lottery_points_per_ticket integer;

-- ============================================================================
-- quests — typy zadań, konfiguracja, cel
-- ============================================================================
-- Nowy zestaw typów zadań (stary networking/session/partner/poll/custom nie był
-- używany — quests to pusty szkielet, więc podmiana CHECK jest bezpieczna).
alter table public.quests
  drop constraint if exists quests_type_check,
  add constraint quests_type_check check (type in (
    'booth_visit',        -- odwiedziny stoiska (skan QR)
    'booth_quiz',         -- quiz przy stoisku
    'booth_password',     -- hasło podane przy stoisku
    'networking_contacts',-- nawiąż N kontaktów
    'profile_complete'    -- uzupełnij profil
  ));

alter table public.quests
  -- Konfiguracja zależna od typu: quiz [{question, options[], correct_id}],
  -- hasło {password}, kontakty korzystają z target_value.
  add column config jsonb,
  -- Cel liczbowy (np. 3 kontakty dla networking_contacts).
  add column target_value integer;

-- Usunięcie partnera czyści jego zadania przy stoisku (kaskada dalej na
-- quest_completions/quiz_attempts). partner_id jest nullable — zadania
-- ogólnoeventowe (partner_id IS NULL) nie są tym dotknięte.
alter table public.quests
  drop constraint if exists quests_partner_id_fkey,
  add constraint quests_partner_id_fkey
    foreign key (partner_id) references public.partners (id) on delete cascade;

-- ============================================================================
-- quest_completions — wynik quizu + kaskada od questa
-- ============================================================================
-- answered_correctly: NULL dla zadań bez oceny; true/false dla quizów
-- (poprawnie = pełne punkty, błędnie = połowa — logika w aplikacji).
alter table public.quest_completions
  add column answered_correctly boolean;

alter table public.quest_completions
  drop constraint if exists quest_completions_quest_id_fkey,
  add constraint quest_completions_quest_id_fkey
    foreign key (quest_id) references public.quests (id) on delete cascade;

-- ============================================================================
-- checkins — kaskada od partnera (attendee-side już z RODO)
-- ============================================================================
alter table public.checkins
  drop constraint if exists checkins_partner_id_fkey,
  add constraint checkins_partner_id_fkey
    foreign key (partner_id) references public.partners (id) on delete cascade;

-- ============================================================================
-- reward_redemptions — kaskada od nagrody (attendee-side już z RODO)
-- ============================================================================
alter table public.reward_redemptions
  drop constraint if exists reward_redemptions_reward_id_fkey,
  add constraint reward_redemptions_reward_id_fkey
    foreign key (reward_id) references public.rewards (id) on delete cascade;

-- ============================================================================
-- quiz_attempts (NOWA) — limit prób i cooldown quizów
-- ============================================================================
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quest_id, attendee_id)
);

-- Indeks pod kaskadę usuwania uczestnika (RODO) — spójnie z resztą tabel.
create index idx_quiz_attempts_attendee_id on public.quiz_attempts (attendee_id);

-- ============================================================================
-- RLS
-- ============================================================================
-- quests i rewards: publiczny odczyt na evencie published/live (uczestnik widzi
-- listę zadań i nagród) — wzorzec z speakers/partners. Zapisy: service_role.
alter table public.quiz_attempts enable row level security;

create policy "public can view quests of published or live events"
on public.quests
for select
to anon, authenticated
using (
  exists (
    select 1 from public.events
    where events.id = quests.event_id
      and events.status in ('published', 'live')
  )
);

create policy "public can view rewards of published or live events"
on public.rewards
for select
to anon, authenticated
using (
  exists (
    select 1 from public.events
    where events.id = rewards.event_id
      and events.status in ('published', 'live')
  )
);

-- quest_completions, checkins, lead_consents, reward_redemptions, quiz_attempts:
-- zostają deny-all (RLS włączone, zero polityk) — cały zapis/odczyt przez
-- service_role po ustaleniu tożsamości server-side. Nie dodajemy tu polityk.
