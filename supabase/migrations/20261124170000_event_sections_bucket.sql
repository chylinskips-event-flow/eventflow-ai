-- Bucket na obrazy sekcji strony wydarzenia (kreator treści). Na produkcji powstał ręcznie,
-- więc świeży projekt (np. osobna baza Preview) go nie miał. Publiczny, jak na produkcji
-- (adresy obrazów budowane są jako publiczne), z limitami z 20261124160000.
-- ON CONFLICT DO NOTHING: na produkcji nic nie zmienia.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-sections', 'event-sections', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
