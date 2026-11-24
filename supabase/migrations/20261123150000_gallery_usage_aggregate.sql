-- Galeria: licznik zajętości liczony w bazie (jedno zapytanie, jeden wiersz wyniku).
--
-- Wcześniej aplikacja pobierała wszystkie wiersze event_photos i sumowała je u siebie,
-- a PostgREST zwraca najwyżej max_rows (1000) wierszy — powyżej tej liczby licznik
-- i budżet miejsca były zaniżone. Dodatkowo porzucone rezerwacje („uploading”)
-- innych wydarzeń liczyły się do wspólnego budżetu bez końca.
--
-- gallery_usage(p_event_id, p_stale_before):
--   * liczy zdjęcia gotowe (size_bytes) i rezerwacje w toku (original_bytes),
--   * pomija rezerwacje starsze niż p_stale_before (porzucone; aplikacja je sprząta),
--   * zwraca licznik i bajty wydarzenia oraz sumę bajtów wszystkich galerii.
-- Tylko service_role (wywołanie z akcji serwera po autoryzacji), jak reserve_event_photo.

CREATE OR REPLACE FUNCTION public.gallery_usage(p_event_id uuid, p_stale_before timestamptz)
RETURNS TABLE (event_count bigint, event_bytes bigint, total_bytes bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH live AS (
    SELECT p.event_id,
           CASE WHEN p.status = 'uploading' THEN p.original_bytes ELSE p.size_bytes END AS bytes
      FROM public.event_photos p
     WHERE p.status = 'ready'
        OR (p.status = 'uploading' AND p.created_at >= p_stale_before)
  )
  SELECT count(*) FILTER (WHERE live.event_id = p_event_id)::bigint,
         coalesce(sum(live.bytes) FILTER (WHERE live.event_id = p_event_id), 0)::bigint,
         coalesce(sum(live.bytes), 0)::bigint
    FROM live;
$$;

REVOKE ALL ON FUNCTION public.gallery_usage(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gallery_usage(uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
