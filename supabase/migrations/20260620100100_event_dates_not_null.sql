-- EventFlow AI — daty eventu (starts_at/ends_at) stają się wymagane.
-- Walidacja na poziomie aplikacji (required + Server Action) już istniała;
-- ta migracja wymusza to ostatecznie na poziomie bazy dla nowych zapisów.
-- Sprawdzone przed wykonaniem: 0 istniejących wierszy z pustymi datami w dev.

alter table public.events
  alter column starts_at set not null,
  alter column ends_at set not null;
