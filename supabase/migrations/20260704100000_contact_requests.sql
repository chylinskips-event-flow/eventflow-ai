-- EventFlow AI — kierunkowe prośby o kontakt (requester → recipient).
--
-- Osobno od matches (init_schema): tamta tabela jest SYMETRYCZNA (attendee_a/
-- attendee_b bez ról) i modeluje cykl życia sugestii systemu (suggested/met/
-- dismissed). Tu semantyka jest KIERUNKOWA i modeluje cykl życia prośby
-- człowieka (pending/accepted/declined) z prywatną notatką każdej ze stron.
-- Sprowadzenie matches do tego kształtu zostawiłoby 3 z 11 kolumn pod nazwą,
-- która kłamie — stąd nowa tabela. Por. match_suggestions (20260627100000).

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requester_id uuid not null references public.attendees (id) on delete cascade,
  recipient_id uuid not null references public.attendees (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  requester_note text,
  recipient_note text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (event_id, requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

-- "Kto mnie zaprosił" — skrzynka odbiorcza, główny odczyt strony uczestnika.
create index idx_contact_requests_event_recipient
  on public.contact_requests (event_id, recipient_id);

-- "Kogo ja zaprosiłem" — oznaczanie stanu na liście uczestników.
create index idx_contact_requests_event_requester
  on public.contact_requests (event_id, requester_id);

-- RLS włączone bez polityk: odczyt/zapis wyłącznie przez service_role,
-- tożsamość ustalona server-side przez getCurrentAttendee (cookie).
-- Jak match_suggestions — anon key NIE ma tu dostępu do niczego.
alter table public.contact_requests enable row level security;

-- ============================================================================
-- attendees.contact_code — kod do wymiany kontaktu (np. "podaj mi swój kod").
-- Świadomie NIE reużywamy qr_code_token: tamten jest tokenem check-inu
-- skanowanym przez organizatora/partnera, a ten pokazujemy innym uczestnikom.
-- Osobna kolumna = osobna granica zaufania.
--
-- Backfill istniejących wierszy jest automatyczny: gen_random_uuid() jest
-- VOLATILE, więc Postgres przepisuje tabelę i wylicza default per wiersz —
-- każdy uczestnik dostaje własny kod (tak samo jak qr_code_token w init_schema).
-- ============================================================================
alter table public.attendees
  add column contact_code text not null default gen_random_uuid()::text;

alter table public.attendees
  add constraint attendees_contact_code_key unique (contact_code);

-- Martwy szkielet z init_schema — nieużywany w kodzie, zastąpiony przez
-- contact_requests (kierunkowe) + match_suggestions (cache sugestii).
comment on table public.matches is
  'DEPRECATED (2026-07): nieużywana. Do usunięcia osobną migracją.';
