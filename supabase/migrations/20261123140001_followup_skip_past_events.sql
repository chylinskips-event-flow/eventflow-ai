-- Follow-up po wydarzeniu kwalifikuje się teraz po godzinie zakończenia (ends_at),
-- z oknem nadrabiania do 7 dni (20261123140000 + src/lib/post-event-followup.ts).
-- Wydarzenia zakończone przed wdrożeniem tej zmiany NIE dostają zaległego follow-upu:
-- oznaczamy je jako obsłużone, żeby pierwsze uruchomienie crona nie rozesłało maili
-- uczestnikom minionych wydarzeń. Dotyczy tylko wydarzeń, które już się skończyły;
-- przyszłe dostaną follow-up normalnie.
-- Uruchomić PRZED wdrożeniem kodu (scaleniem PR). Idempotentne.

UPDATE public.events
SET followup_sent_at = now()
WHERE followup_sent_at IS NULL
  AND ends_at IS NOT NULL
  AND ends_at < now();
