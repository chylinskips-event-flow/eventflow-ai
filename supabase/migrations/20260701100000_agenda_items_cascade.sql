-- ON DELETE CASCADE dla agenda_items: usunięcie sesji (albo uczestnika) ma
-- sprzątać wpisy "Mojej agendy". Bez tego FK blokuje delete sesji, gdy jest
-- ona w czyjejś agendzie.

alter table public.agenda_items
  drop constraint agenda_items_session_id_fkey,
  add constraint agenda_items_session_id_fkey
    foreign key (session_id) references public.sessions (id) on delete cascade;

-- Spójnie: usunięcie uczestnika też czyści jego wpisy w agendzie.
alter table public.agenda_items
  drop constraint agenda_items_attendee_id_fkey,
  add constraint agenda_items_attendee_id_fkey
    foreign key (attendee_id) references public.attendees (id) on delete cascade;
