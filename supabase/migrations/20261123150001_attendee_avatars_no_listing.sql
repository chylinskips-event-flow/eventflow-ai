-- Bucket attendee-avatars: bez polityki SELECT dla anon/authenticated.
--
-- Bucket jest publiczny, więc adresy /storage/v1/object/public/attendee-avatars/...
-- działają bez żadnej polityki RLS (publiczny odczyt pliku po znanej ścieżce).
-- Polityka SELECT na storage.objects była potrzebna tylko do listowania i pobierania
-- przez API Storage — a to pozwalało wylistować wszystkie obiekty bucketu.
-- Zapis, podmiana i usuwanie idą wyłącznie przez akcje serwera (service_role,
-- omija RLS), więc zdjęcie polityki niczego w aplikacji nie zmienia.

DROP POLICY IF EXISTS "public can view attendee avatars" ON storage.objects;
