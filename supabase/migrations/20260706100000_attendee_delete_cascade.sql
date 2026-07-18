-- EventFlow AI — dopełnienie ON DELETE dla wszystkich FK wskazujących na
-- attendees, żeby usunięcie uczestnika (RODO: prawo do usunięcia danych)
-- kaskadowo czyściło jego rekordy zamiast rzucać FK violation (23503).
--
-- init_schema tworzył te FK bez trybu ON DELETE (domyślnie RESTRICT). Część
-- tabel to nieużywane szkielety, ale schemat musi być spójny niezależnie od
-- tego, kiedy się zapełnią. Uwzględnia też zależności DRUGIEGO RZĘDU
-- (question_votes.question_id, lead_consents.checkin_id) — inaczej kaskada na
-- questions/checkins sama wywaliłaby się na ich dzieciach.
--
-- Nazwy constraintów to domyślne nazwy Postgresa dla inline FK
-- (<tabela>_<kolumna>_fkey); drop ... if exists jest odporny na powtórne uruch.

-- Bezpośrednie FK → attendees (dane osobowe uczestnika: CASCADE)
alter table public.quest_completions
  drop constraint if exists quest_completions_attendee_id_fkey,
  add constraint quest_completions_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;

alter table public.questions
  drop constraint if exists questions_attendee_id_fkey,
  add constraint questions_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;

alter table public.poll_answers
  drop constraint if exists poll_answers_attendee_id_fkey,
  add constraint poll_answers_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;

alter table public.reward_redemptions
  drop constraint if exists reward_redemptions_attendee_id_fkey,
  add constraint reward_redemptions_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;

alter table public.matches
  drop constraint if exists matches_attendee_a_id_fkey,
  add constraint matches_attendee_a_id_fkey
    foreign key (attendee_a_id) references public.attendees (id) on delete cascade,
  drop constraint if exists matches_attendee_b_id_fkey,
  add constraint matches_attendee_b_id_fkey
    foreign key (attendee_b_id) references public.attendees (id) on delete cascade;

alter table public.checkins
  drop constraint if exists checkins_attendee_id_fkey,
  add constraint checkins_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;

alter table public.feedback
  drop constraint if exists feedback_attendee_id_fkey,
  add constraint feedback_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;

-- Log analityczny: attendee_id jest nullable — anonimizujemy wpis (SET NULL),
-- zamiast kasować metrykę eventu.
alter table public.event_analytics_log
  drop constraint if exists event_analytics_log_attendee_id_fkey,
  add constraint event_analytics_log_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete set null;

-- Zależności drugiego rzędu (dzieci tabel kasowanych kaskadą przez attendees).
alter table public.question_votes
  drop constraint if exists question_votes_attendee_id_fkey,
  add constraint question_votes_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade,
  drop constraint if exists question_votes_question_id_fkey,
  add constraint question_votes_question_id_fkey
    foreign key (question_id) references public.questions (id) on delete cascade;

alter table public.lead_consents
  drop constraint if exists lead_consents_checkin_id_fkey,
  add constraint lead_consents_checkin_id_fkey
    foreign key (checkin_id) references public.checkins (id) on delete cascade;
