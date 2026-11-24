-- „Wejdź ponownie” — atomowy limit próśb o link do panelu uczestnika. Idempotentna.
--
-- try_record_access_link_request sprawdza limit (na hash e-maila i na hash IP w oknie czasu)
-- i zapisuje prośbę w JEDNEJ transakcji. Blokady doradcze (pg_advisory_xact_lock) na hash
-- e-maila i hash IP serializują równoległe prośby dla tego samego adresu / IP, więc nie
-- przechodzi ich więcej niż limit. Kolejność blokad stała (e-mail, potem IP) — bez zakleszczeń.
-- Zwraca true, gdy prośba została zapisana; false, gdy limit jest wyczerpany (nic nie zapisuje).
--
-- Tylko nowa funkcja: tabela bez zmian, dotychczasowy kod (zapytania count + insert) działa dalej.
-- Wywoływana wyłącznie z serwera (service_role); anon/authenticated nie mają EXECUTE.

CREATE OR REPLACE FUNCTION public.try_record_access_link_request(
  p_event_id    uuid,
  p_email_hash  text,
  p_ip_hash     text,
  p_since       timestamptz,
  p_max_email   int,
  p_max_ip      int
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_email int;
  v_ip    int;
BEGIN
  -- Przestrzenie kluczy rozdzielone pierwszym argumentem (stałe dla tej funkcji).
  PERFORM pg_advisory_xact_lock(724101, hashtext(p_email_hash));
  PERFORM pg_advisory_xact_lock(724102, hashtext(p_ip_hash));

  SELECT COUNT(*)::int INTO v_email
    FROM public.attendee_access_link_requests
   WHERE email_hash = p_email_hash AND created_at >= p_since;

  SELECT COUNT(*)::int INTO v_ip
    FROM public.attendee_access_link_requests
   WHERE ip_hash = p_ip_hash AND created_at >= p_since;

  IF v_email >= p_max_email OR v_ip >= p_max_ip THEN
    RETURN false;
  END IF;

  INSERT INTO public.attendee_access_link_requests (event_id, email_hash, ip_hash)
  VALUES (p_event_id, p_email_hash, p_ip_hash);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.try_record_access_link_request(uuid, text, text, timestamptz, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_record_access_link_request(uuid, text, text, timestamptz, int, int)
  TO service_role;

NOTIFY pgrst, 'reload schema';
