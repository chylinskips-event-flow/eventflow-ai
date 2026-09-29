-- Soft-delete support for events.
-- Organizer can mark an event as deleted (deleted_at IS NOT NULL) without
-- physically removing the row or its financial records (orders, tickets).
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS events_deleted_at_not_null
  ON events (id) WHERE deleted_at IS NOT NULL;
