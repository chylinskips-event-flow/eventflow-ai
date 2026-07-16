-- EventFlow AI — znacznik ostatniego wygenerowania dopasowań dla uczestnika.
-- NULL = nigdy nie generowano: odróżnia "pusto, bo nie próbował" (STAN 1) od
-- "pusto, bo 0 wyników po generowaniu" (STAN 3). Jest też źródłem prawdy dla
-- limitu odświeżania 60 min — przy 0 wynikach nie ma wpisów w
-- match_suggestions, z których można by odczytać created_at.

alter table public.attendees
  add column matches_generated_at timestamptz;
