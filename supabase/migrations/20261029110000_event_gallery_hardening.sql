-- Galeria — poprawki po 20261029100000_event_gallery.sql. Idempotentna, kończy się NOTIFY pgrst.
-- SZKIC DO PRZEGLĄDU — nie uruchamiać bez zgody właściciela.
--
-- 1. reserve_event_photo: stały search_path (ostrzeżenie Supabase „function_search_path_mutable”).
--    Pusty search_path jest bezpieczny: funkcja używa wyłącznie nazw kwalifikowanych (public.*),
--    a funkcje wbudowane (count, now, hashtext, pg_advisory_xact_lock) są w pg_catalog,
--    który Postgres przeszukuje zawsze.
-- 2. Bucket event-photos przyjmuje także HEIC/HEIF (iPhone). Serwer dekoduje je (libheif)
--    i zapisuje jako JPEG — oryginał HEIC jest usuwany po przetworzeniu, jak każdy inny.

ALTER FUNCTION public.reserve_event_photo(uuid, uuid, uuid, text, bigint, integer)
  SET search_path = '';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'event-photos';

NOTIFY pgrst, 'reload schema';
