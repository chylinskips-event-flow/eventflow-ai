-- Panel prowadzącego (moderatora sali) — linki per sala, alerty do ogłoszenia, scenariusz,
-- pytania do panelistów. Idempotentna. Zastosować w Supabase PRZED / razem z deployem.
-- Wszystkie nowe tabele: RLS deny-all — dostęp wyłącznie przez server actions
-- (organizator: getOwnEvent; prowadzący: ważny token linku) + service_role.
-- Treści dla prowadzącego celowo NIE w events/sessions: te tabele mają publiczny SELECT
-- (strona eventu), więc scenariusz byłby czytelny dla każdego przez API.

-- ── Linki prowadzących (sekretny token per sala, unieważnialny) ────────────
CREATE TABLE IF NOT EXISTS public.moderator_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  room        text,                         -- NULL = wszystkie sale
  label       text NOT NULL,
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderator_links_label_length CHECK (char_length(label) BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS moderator_links_token_key ON public.moderator_links (token);
CREATE INDEX IF NOT EXISTS moderator_links_event_idx ON public.moderator_links (event_id);
ALTER TABLE public.moderator_links ENABLE ROW LEVEL SECURITY;

-- ── Alerty od organizatora do ogłoszenia na sali ───────────────────────────
CREATE TABLE IF NOT EXISTS public.event_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  room          text,                       -- NULL = wszystkie sale
  content       text NOT NULL,
  is_important  boolean NOT NULL DEFAULT false,
  announced_at  timestamptz,
  announced_via uuid REFERENCES public.moderator_links(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_alerts_content_length CHECK (char_length(content) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS event_alerts_event_idx ON public.event_alerts (event_id, created_at DESC);
ALTER TABLE public.event_alerts ENABLE ROW LEVEL SECURITY;

-- ── Scenariusz (session_id NULL) i notatki do sesji dla prowadzącego ───────
CREATE TABLE IF NOT EXISTS public.moderator_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  content     text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderator_notes_content_length CHECK (char_length(content) <= 10000)
);
CREATE UNIQUE INDEX IF NOT EXISTS moderator_notes_event_script_key
  ON public.moderator_notes (event_id) WHERE session_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS moderator_notes_session_key
  ON public.moderator_notes (session_id) WHERE session_id IS NOT NULL;
ALTER TABLE public.moderator_notes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.moderator_notes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.moderator_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Pytania do konkretnego panelisty (opcjonalnie) ─────────────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS target_speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
