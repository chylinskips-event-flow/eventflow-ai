-- Add dropped_at timestamp to mixer_participants
-- status 'dropped' already exists in CHECK constraint from initial migration
alter table public.mixer_participants
  add column if not exists dropped_at timestamptz;
