-- Dodaje kolumnę first_question do match_suggestions.
-- nullable — istniejące wiersze pozostają z NULL; brak backfill.
alter table public.match_suggestions
  add column first_question text;
