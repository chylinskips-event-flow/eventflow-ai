-- Galeria zdjęć z eventu — Faza 1 (bez rozpoznawania twarzy). Idempotentna, kończy się NOTIFY pgrst.
-- SZKIC DO PRZEGLĄDU — nie uruchamiać bez zgody właściciela.
--
-- Przepływ: aplikacja rezerwuje wiersz (reserve_event_photo: limity + duplikat, atomowo),
-- przeglądarka wysyła plik prosto do Storage (podpisany adres), serwer przetwarza
-- (EXIF, 2560 px, JPEG, znak wodny, miniatura) i usuwa oryginał.
-- Pliki w PRYWATNYM buckecie event-photos; uczestnik dostaje krótkotrwałe podpisane adresy
-- dopiero po sprawdzeniu check-inu. Wszystkie tabele: RLS deny-all (bez polityk) —
-- zapis i odczyt tylko service_role z akcji serwera, jak w module prowadzących.

-- ── Ustawienia galerii (jeden wiersz na event; brak wiersza = wartości domyślne) ──────────
CREATE TABLE IF NOT EXISTS public.event_gallery_settings (
  event_id          uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  enabled           boolean     NOT NULL DEFAULT false,  -- pozycja „Zdjęcia” w panelu uczestnika
  watermark_enabled boolean     NOT NULL DEFAULT true,   -- logo organizatora na wersji display
  info_text         text,                                -- NULL = tekst domyślny z aplikacji
  published_at      timestamptz,                         -- NULL = „Galeria pojawi się wkrótce”
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_gallery_settings_info_length CHECK (info_text IS NULL OR char_length(info_text) <= 1000)
);
ALTER TABLE public.event_gallery_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.event_gallery_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.event_gallery_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Linki fotografa (upload bez konta; wzorzec jak moderator_links) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.gallery_upload_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label       text        NOT NULL,                      -- nazwa fotografa
  token       uuid        NOT NULL DEFAULT gen_random_uuid(),
  expires_at  timestamptz,                               -- NULL = bez daty ważności
  max_photos  integer,                                   -- NULL = tylko limit eventu (500)
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gallery_upload_links_label_length CHECK (char_length(label) BETWEEN 1 AND 100),
  CONSTRAINT gallery_upload_links_max_photos CHECK (max_photos IS NULL OR max_photos BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS gallery_upload_links_token_key ON public.gallery_upload_links (token);
CREATE INDEX IF NOT EXISTS gallery_upload_links_event_idx ON public.gallery_upload_links (event_id);
ALTER TABLE public.gallery_upload_links ENABLE ROW LEVEL SECURITY;

-- ── Zdjęcia ─────────────────────────────────────────────────────────────────────────────────
-- status: uploading (zarezerwowane, plik w drodze) → ready | failed.
-- Wiersze „uploading” starsze niż 2 h aplikacja sprząta (z plikiem) przy kolejnych uploadach.
CREATE TABLE IF NOT EXISTS public.event_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  upload_link_id  uuid        REFERENCES public.gallery_upload_links(id) ON DELETE SET NULL,
  uploaded_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,  -- organizator
  status          text        NOT NULL DEFAULT 'uploading'
                    CHECK (status IN ('uploading', 'ready', 'failed')),
  original_path   text,                                  -- tymczasowy; NULL po przetworzeniu
  display_path    text,                                  -- 2560 px, JPEG, ew. znak wodny
  thumb_path      text,                                  -- miniatura
  width           integer,
  height          integer,
  original_bytes  bigint      NOT NULL,                  -- rozmiar pliku źródłowego (deklarowany)
  size_bytes      bigint      NOT NULL DEFAULT 0,        -- display + thumb (licznik miejsca)
  content_hash    text        NOT NULL,                  -- SHA-256 pliku źródłowego (duplikaty)
  watermarked     boolean     NOT NULL DEFAULT false,
  hidden          boolean     NOT NULL DEFAULT false,    -- ukryte przez organizatora
  taken_at        timestamptz,                           -- z EXIF (przed usunięciem metadanych)
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  CONSTRAINT event_photos_hash_format CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT event_photos_size CHECK (original_bytes BETWEEN 1 AND 15728640),
  CONSTRAINT event_photos_ready_paths CHECK (
    status <> 'ready' OR (display_path IS NOT NULL AND thumb_path IS NOT NULL)
  )
);
-- Ten sam plik drugi raz w tym samym evencie = duplikat (nieudane próby nie blokują ponowienia).
CREATE UNIQUE INDEX IF NOT EXISTS event_photos_event_hash_key
  ON public.event_photos (event_id, content_hash) WHERE status <> 'failed';
CREATE INDEX IF NOT EXISTS event_photos_event_idx ON public.event_photos (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_photos_link_idx ON public.event_photos (upload_link_id) WHERE upload_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_photos_uploading_idx ON public.event_photos (created_at) WHERE status = 'uploading';
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

-- ── „To ja” — uczestnik oznacza wyłącznie siebie ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_photo_tags (
  photo_id    uuid        NOT NULL REFERENCES public.event_photos(id) ON DELETE CASCADE,
  attendee_id uuid        NOT NULL REFERENCES public.attendees(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, attendee_id)
);
CREATE INDEX IF NOT EXISTS event_photo_tags_attendee_idx ON public.event_photo_tags (attendee_id);
ALTER TABLE public.event_photo_tags ENABLE ROW LEVEL SECURITY;

-- ── Zgłoszenia / prośby o usunięcie (sprzeciw wobec wizerunku) ──────────────────────────────
-- Zdjęcie z otwartym zgłoszeniem (status pending) jest niewidoczne dla uczestników do decyzji
-- organizatora. Po usunięciu zdjęcia zgłoszenie zostaje (photo_id NULL) jako ślad decyzji.
CREATE TABLE IF NOT EXISTS public.event_photo_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  photo_id    uuid        REFERENCES public.event_photos(id) ON DELETE SET NULL,
  attendee_id uuid        REFERENCES public.attendees(id) ON DELETE SET NULL,
  kind        text        NOT NULL CHECK (kind IN ('remove_me', 'other')),
  message     text,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'removed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT event_photo_reports_message_length CHECK (message IS NULL OR char_length(message) <= 500)
);
-- Jedno otwarte zgłoszenie danego zdjęcia od danej osoby.
CREATE UNIQUE INDEX IF NOT EXISTS event_photo_reports_open_key
  ON public.event_photo_reports (photo_id, attendee_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS event_photo_reports_event_idx ON public.event_photo_reports (event_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS event_photo_reports_photo_idx ON public.event_photo_reports (photo_id) WHERE status = 'pending';
ALTER TABLE public.event_photo_reports ENABLE ROW LEVEL SECURITY;

-- ── Atomowa rezerwacja miejsca na zdjęcie (limity + duplikat) ───────────────────────────────
-- Blokada doradcza per event: równoległe uploady (kilka plików, fotograf + organizator) nie
-- przekroczą limitu 500. Wynik: ok | duplicate | event_limit | link_invalid | link_limit.
CREATE OR REPLACE FUNCTION public.reserve_event_photo(
  p_event_id       uuid,
  p_upload_link_id uuid,
  p_uploaded_by    uuid,
  p_content_hash   text,
  p_original_bytes bigint,
  p_max_per_event  integer
) RETURNS TABLE (photo_id uuid, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_link public.gallery_upload_links%ROWTYPE;
  v_id   uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('event_photos:' || p_event_id::text));

  IF p_upload_link_id IS NOT NULL THEN
    SELECT * INTO v_link FROM public.gallery_upload_links
     WHERE id = p_upload_link_id AND event_id = p_event_id;
    IF NOT FOUND OR v_link.revoked_at IS NOT NULL
       OR (v_link.expires_at IS NOT NULL AND v_link.expires_at <= now()) THEN
      RETURN QUERY SELECT NULL::uuid, 'link_invalid'::text; RETURN;
    END IF;
    IF v_link.max_photos IS NOT NULL AND (
      SELECT count(*) FROM public.event_photos
       WHERE upload_link_id = p_upload_link_id AND status <> 'failed'
    ) >= v_link.max_photos THEN
      RETURN QUERY SELECT NULL::uuid, 'link_limit'::text; RETURN;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_photos
     WHERE event_id = p_event_id AND content_hash = p_content_hash AND status <> 'failed'
  ) THEN
    RETURN QUERY SELECT NULL::uuid, 'duplicate'::text; RETURN;
  END IF;

  IF (SELECT count(*) FROM public.event_photos
       WHERE event_id = p_event_id AND status <> 'failed') >= p_max_per_event THEN
    RETURN QUERY SELECT NULL::uuid, 'event_limit'::text; RETURN;
  END IF;

  INSERT INTO public.event_photos (event_id, upload_link_id, uploaded_by, content_hash, original_bytes)
  VALUES (p_event_id, p_upload_link_id, p_uploaded_by, p_content_hash, p_original_bytes)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, 'ok'::text;
END;
$$;
-- Tylko serwer (service_role) — nie anon/authenticated przez PostgREST.
REVOKE ALL ON FUNCTION public.reserve_event_photo(uuid, uuid, uuid, text, bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_event_photo(uuid, uuid, uuid, text, bigint, integer) TO service_role;

-- ── Bucket: prywatny, limit 15 MB i formaty wymuszane także przez Storage ───────────────────
-- Bez polityk na storage.objects: odczyt/zapis wyłącznie service_role i podpisane adresy.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-photos', 'event-photos', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── Plany: galeria z eventu we wszystkich planach (osobny klucz od photo_gallery) ───────────
-- photo_gallery = publiczna sekcja „Galeria” w kreatorze strony (Business+), bez zmian.
-- Tylko gdy klucza jeszcze nie ma (ręczne zmiany w bazie nie są nadpisywane).
UPDATE public.plans
SET features = features || jsonb_build_object('event_photos', true)
WHERE NOT (features ? 'event_photos');

NOTIFY pgrst, 'reload schema';
