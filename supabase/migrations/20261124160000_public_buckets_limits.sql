-- Publiczne buckety obrazów: limit typu i rozmiaru także po stronie Storage.
--
-- Aplikacja zapisuje do nich wyłącznie obrazy JPEG/PNG/WebP (po ponownym zakodowaniu przez
-- sharp: image-sanitize, avatar, logo, tło identyfikatora, baner, prelegenci, partnerzy,
-- nagrody i galeria sekcji — WebP). Wejście jest ograniczone w aplikacji do 4 MB (avatar
-- 2 MB), ale plik po ponownym zakodowaniu bywa większy od wejściowego (np. PNG z paletą
-- → pełny kolor), dlatego limit Storage ma zapas: 15 MB, jak w buckecie galerii.
-- SVG/HTML/PDF i inne typy nie są tu nigdy wgrywane przez aplikację.
--
-- Zmiana dotyczy tylko NOWYCH wysyłek; istniejące pliki zostają bez zmian. Kod sprzed tej
-- migracji wysyła wyłącznie powyższe typy z jawnym Content-Type, więc działa bez zmian.
-- Idempotentne: ponowne uruchomienie ustawia te same wartości; brakujący bucket = brak zmian.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 15728640
WHERE id IN (
  'event-logos',
  'speaker-photos',
  'event-content',
  'attendee-avatars',
  'partner-logos',
  'reward-images',
  'event-sections'
);
