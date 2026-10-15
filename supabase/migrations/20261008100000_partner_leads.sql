-- #10 Faza B — pytania sponsora przy stoisku, osobna zgoda na przekazanie danych partnerowi,
-- leady w panelu partnera, dziennik audytu. Idempotentna, kończy się NOTIFY pgrst.
--
-- Funkcja jest za flagą PARTNER_LEADS_ENABLED (env) i bramką prawną w kodzie
-- (PARTNER_LEADS_CONSENT.legalApproved) — na produkcji wyłączona, dopóki prawnik nie
-- zatwierdzi treści zgody. Tabele mogą istnieć wcześniej; bez flagi nic do nich nie pisze.
--
-- Wszystkie tabele: RLS deny-all (dostęp wyłącznie przez server actions po autoryzacji
-- + service_role). PK `id`, żeby PostgREST nie traktował ich jako tabel łączących.

-- ── Pytania partnera (do akceptacji organizatora) ──────────────────────────
-- kind: text (krótka odpowiedź) | single_choice (options: [{"id": "a", "label": "…"}, …]).
CREATE TABLE IF NOT EXISTS public.partner_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  position    smallint NOT NULL DEFAULT 0,
  kind        text NOT NULL CHECK (kind IN ('text', 'single_choice')),
  prompt      text NOT NULL,
  options     jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_questions_prompt_length CHECK (char_length(prompt) BETWEEN 1 AND 300),
  CONSTRAINT partner_questions_options_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT partner_questions_note_length CHECK (coalesce(char_length(review_note), 0) <= 1000)
);
CREATE INDEX IF NOT EXISTS partner_questions_partner_idx ON public.partner_questions (partner_id, position);
CREATE INDEX IF NOT EXISTS partner_questions_event_idx ON public.partner_questions (event_id);
ALTER TABLE public.partner_questions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.partner_questions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.partner_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Zgoda uczestnika na przekazanie danych TEMU partnerowi ─────────────────
-- Osobna od zgody leadowej przy check-inie (checkins.lead_consent_given). Przechowujemy
-- wersję i pełną treść zgody (dowód, co uczestnik zobaczył). Wycofanie: withdrawn_at
-- + usunięcie odpowiedzi; nowa zgoda = nowy wiersz.
CREATE TABLE IF NOT EXISTS public.partner_lead_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  attendee_id     uuid NOT NULL REFERENCES public.attendees (id) ON DELETE CASCADE,
  consent_version text NOT NULL,
  consent_text    text NOT NULL,
  given_at        timestamptz NOT NULL DEFAULT now(),
  withdrawn_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_lead_consents_text_length CHECK (char_length(consent_text) BETWEEN 1 AND 4000)
);
-- Jedna aktywna zgoda na parę partner–uczestnik.
CREATE UNIQUE INDEX IF NOT EXISTS partner_lead_consents_active_key
  ON public.partner_lead_consents (partner_id, attendee_id) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS partner_lead_consents_attendee_idx ON public.partner_lead_consents (attendee_id);
CREATE INDEX IF NOT EXISTS partner_lead_consents_event_idx ON public.partner_lead_consents (event_id);
ALTER TABLE public.partner_lead_consents ENABLE ROW LEVEL SECURITY;

-- ── Odpowiedzi (istnieją tylko przy aktywnej zgodzie) ──────────────────────
CREATE TABLE IF NOT EXISTS public.partner_question_answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id   uuid NOT NULL REFERENCES public.partner_lead_consents (id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES public.partner_questions (id) ON DELETE CASCADE,
  partner_id   uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  attendee_id  uuid NOT NULL REFERENCES public.attendees (id) ON DELETE CASCADE,
  -- Treść pytania w chwili odpowiedzi (pytanie mogło się później zmienić).
  prompt       text NOT NULL,
  answer       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_question_answers_answer_length CHECK (char_length(answer) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_question_answers_consent_question_key
  ON public.partner_question_answers (consent_id, question_id);
CREATE INDEX IF NOT EXISTS partner_question_answers_partner_idx ON public.partner_question_answers (partner_id);
ALTER TABLE public.partner_question_answers ENABLE ROW LEVEL SECURITY;

-- ── Dziennik audytu (append-only) ──────────────────────────────────────────
-- Kto i kiedy: wyraził/wycofał zgodę, przeglądał/eksportował leady, zgłosił/ocenił pytanie.
-- attendee_id bez FK: wpis przeżywa usunięcie konta uczestnika (zostaje sam identyfikator).
CREATE TABLE IF NOT EXISTS public.partner_lead_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  actor_type    text NOT NULL CHECK (actor_type IN ('attendee', 'partner', 'organizer')),
  actor_user_id uuid,
  attendee_id   uuid,
  action        text NOT NULL CHECK (action IN (
    'consent_given', 'consent_withdrawn',
    'leads_viewed', 'leads_exported',
    'question_submitted', 'question_deleted', 'question_approved', 'question_rejected'
  )),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_lead_audit_partner_idx ON public.partner_lead_audit (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_lead_audit_event_idx ON public.partner_lead_audit (event_id, created_at DESC);
ALTER TABLE public.partner_lead_audit ENABLE ROW LEVEL SECURITY;

-- Append-only także dla service_role: zmiana/usunięcie pojedynczego wpisu → wyjątek.
-- (Kaskada z usunięcia eventu/partnera nadal działa — to DELETE wywołany przez FK.)
CREATE OR REPLACE FUNCTION public.partner_lead_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'partner_lead_audit is append-only';
  END IF;
  -- DELETE: dopuszczamy tylko kaskadę (partner albo event już nie istnieje — kolejność
  -- kaskad z events → partners/audit nie jest gwarantowana, więc sprawdzamy oba).
  IF EXISTS (SELECT 1 FROM public.partners WHERE id = OLD.partner_id)
     AND EXISTS (SELECT 1 FROM public.events WHERE id = OLD.event_id) THEN
    RAISE EXCEPTION 'partner_lead_audit is append-only';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS partner_lead_audit_append_only ON public.partner_lead_audit;
CREATE TRIGGER partner_lead_audit_append_only
  BEFORE UPDATE OR DELETE ON public.partner_lead_audit
  FOR EACH ROW EXECUTE FUNCTION public.partner_lead_audit_append_only();

NOTIFY pgrst, 'reload schema';
