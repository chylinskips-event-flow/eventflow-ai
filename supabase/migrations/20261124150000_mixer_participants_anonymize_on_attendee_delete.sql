-- Mixer: usunięcie uczestnika (samoobsługowe „Usuń moje dane” albo przez organizatora)
-- usuwa też jego dane osobowe z migawki mixer_participants.
--
-- mixer_participants trzyma kopię imienia i firmy (display_name, company), a FK attendee_id
-- ma ON DELETE SET NULL — wiersz zostawał z danymi osoby, która usunęła konto. Struktura planu
-- (przydziały do stolików, liczba osób w rundach) zostaje; znika tylko to, kim była ta osoba.
--
-- 1. Trigger BEFORE DELETE na attendees: anonimizuje wiersze tej osoby we wszystkich mixerach
--    (w tej samej transakcji co usunięcie) i oznacza aktywne jako rezygnację ('dropped'),
--    żeby nie trafiała do kolejnych rund ani na rzutnik. Musi być BEFORE — po usunięciu
--    FK ustawia już attendee_id = NULL i nie da się znaleźć wierszy tej osoby.
-- 2. Jednorazowe uzupełnienie: wiersze po wcześniej usuniętych uczestnikach (attendee_id IS NULL
--    — FK ustawia NULL wyłącznie przy usunięciu uczestnika) tracą imię i firmę. Status zostaje.
--
-- Bezpieczna przy działającym kodzie: kod nie czyta wierszy z attendee_id = NULL inaczej niż
-- jako zwykłą pozycję planu. Idempotentna. Nie zmienia polityk RLS.

-- Wyszukiwanie wierszy po attendee_id (trigger i akcja FK); unikat (mixer_id, attendee_id)
-- zaczyna się od mixer_id, więc go nie wykorzysta. Tabela jest mała — zwykły indeks.
CREATE INDEX IF NOT EXISTS mixer_participants_attendee_idx
  ON public.mixer_participants (attendee_id);

CREATE OR REPLACE FUNCTION public.anonymize_mixer_participant_on_attendee_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.mixer_participants
  SET display_name = 'Usunięty uczestnik',
      company      = NULL,
      status       = CASE WHEN status = 'active' THEN 'dropped' ELSE status END,
      dropped_at   = CASE WHEN status = 'active' THEN now() ELSE dropped_at END
  WHERE attendee_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_mixer_participant_on_attendee_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS anonymize_mixer_participant ON public.attendees;
CREATE TRIGGER anonymize_mixer_participant
  BEFORE DELETE ON public.attendees
  FOR EACH ROW EXECUTE FUNCTION public.anonymize_mixer_participant_on_attendee_delete();

UPDATE public.mixer_participants
SET display_name = 'Usunięty uczestnik',
    company      = NULL
WHERE attendee_id IS NULL
  AND (display_name <> 'Usunięty uczestnik' OR company IS NOT NULL);
