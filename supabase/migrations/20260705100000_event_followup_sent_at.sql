-- EventFlow AI — flaga jednokrotnej wysyłki maila follow-up po evencie.
--
-- NULL = jeszcze nie wysłano; timestamp = wysłano (kiedy). Cron post-event
-- wybiera eventy z followup_sent_at IS NULL i stempluje kolumnę po rozesłaniu
-- maili, więc kolejne uruchomienia crona tego samego dnia nie dublują wysyłki.
alter table public.events
  add column followup_sent_at timestamptz;
