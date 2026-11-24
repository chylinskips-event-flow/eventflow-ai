-- Usunięcie uczestnika razem ze zwolnieniem jego biletów w jednej transakcji.
--
-- delete_attendee_releasing_tickets: blokuje rekord uczestnika, zwalnia jego bilety w wydarzeniu
-- (release_deleted_attendee_tickets) i usuwa rekord. Gdy usunięcie się nie powiedzie, zwolnienie
-- biletów jest wycofywane razem z nim — uczestnik, który nadal istnieje, zachowuje ważne bilety,
-- a jego miejsce nie wraca do sprzedaży.
-- Błąd samego zwolnienia biletów nie blokuje usunięcia danych osobowych (wycofywany jest tylko
-- blok zwalniania, jak dotychczas w kodzie aplikacji).
-- Zwraca true, gdy rekord usunięto, false, gdy uczestnik nie istniał.
--
-- Wywoływana wyłącznie z serwera (service_role); anon/authenticated nie mają EXECUTE.
-- Zgodna z kodem sprzed zmiany: nowa funkcja, nieużywana przez obecny kod.

CREATE OR REPLACE FUNCTION public.delete_attendee_releasing_tickets(p_attendee_id uuid)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id uuid;
BEGIN
  SELECT event_id
    INTO v_event_id
    FROM public.attendees
   WHERE id = p_attendee_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_event_id IS NOT NULL THEN
    BEGIN
      PERFORM public.release_deleted_attendee_tickets(v_event_id, p_attendee_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_attendee_releasing_tickets: ticket release failed for %: %',
        p_attendee_id, SQLERRM;
    END;
  END IF;

  DELETE FROM public.attendees WHERE id = p_attendee_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_attendee_releasing_tickets(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_attendee_releasing_tickets(uuid) TO service_role;
