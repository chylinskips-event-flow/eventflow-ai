-- #11 Q&A na żywo, ankiety i oceny sesji — uzupełnienie tabel z init_schema
-- (questions, question_votes, polls, poll_answers, feedback), które dotąd nie były używane.
-- Idempotentna. Zastosować w Supabase PRZED / razem z deployem (kończy się NOTIFY pgrst).
-- RLS bez zmian: tabele deny-all dla klienta, dostęp wyłącznie przez server actions
-- (tożsamość uczestnika z cookie / organizatora z getOwnEvent) + service_role.

-- ── Kaskady: usunięcie sesji / eventu / pytania / ankiety sprząta zależne wiersze ──
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_session_id_fkey,
  ADD CONSTRAINT questions_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions (id) ON DELETE CASCADE;

ALTER TABLE public.question_votes
  DROP CONSTRAINT IF EXISTS question_votes_question_id_fkey,
  ADD CONSTRAINT question_votes_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions (id) ON DELETE CASCADE;

ALTER TABLE public.polls
  DROP CONSTRAINT IF EXISTS polls_session_id_fkey,
  ADD CONSTRAINT polls_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions (id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS polls_event_id_fkey,
  ADD CONSTRAINT polls_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events (id) ON DELETE CASCADE;

ALTER TABLE public.poll_answers
  DROP CONSTRAINT IF EXISTS poll_answers_poll_id_fkey,
  ADD CONSTRAINT poll_answers_poll_id_fkey
    FOREIGN KEY (poll_id) REFERENCES public.polls (id) ON DELETE CASCADE;

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_session_id_fkey,
  ADD CONSTRAINT feedback_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions (id) ON DELETE CASCADE;

-- ── Pytania ────────────────────────────────────────────────────────────────
-- status: pending = widoczne (domyślnie), selected = „teraz omawiane” (wyróżnione na rzutniku),
--         answered = odpowiedziane, hidden = ukryte przez organizatora.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_content_length') THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_content_length CHECK (char_length(content) BETWEEN 1 AND 500);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_session_status ON public.questions (session_id, status);

-- vote_count utrzymywany w bazie (atomowo, odporne na równoległe głosy).
CREATE OR REPLACE FUNCTION public.questions_sync_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.questions SET vote_count = vote_count + 1 WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.questions SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.question_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS question_votes_sync_count ON public.question_votes;
CREATE TRIGGER question_votes_sync_count
  AFTER INSERT OR DELETE ON public.question_votes
  FOR EACH ROW EXECUTE FUNCTION public.questions_sync_vote_count();

-- ── Ankiety ────────────────────────────────────────────────────────────────
-- options: [{ "id": "a1b2", "label": "Tak" }, …]; status: draft → open → closed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polls_options_array') THEN
    ALTER TABLE public.polls
      ADD CONSTRAINT polls_options_array CHECK (options IS NULL OR jsonb_typeof(options) = 'array');
  END IF;
END $$;

-- ── Oceny sesji (feedback) ─────────────────────────────────────────────────
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_comment_length') THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_comment_length CHECK (comment IS NULL OR char_length(comment) <= 1000);
  END IF;
END $$;

-- ── updated_at ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON public.questions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.polls;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.feedback;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Token ekranu rzutnika Q&A (per sesja) ──────────────────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS qa_present_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS sessions_qa_present_token_key ON public.sessions (qa_present_token);

-- ── Plany: funkcja live_qa (Q&A, ankiety, oceny) w Business i Enterprise ────
-- Tylko gdy klucza jeszcze nie ma (ręczne zmiany w bazie nie są nadpisywane).
UPDATE public.plans
SET features = features || jsonb_build_object('live_qa', key IN ('business', 'enterprise'))
WHERE NOT (features ? 'live_qa');

-- ── Agregaty (tylko service_role — wywoływane po autoryzacji w kodzie) ──────
-- Liczone w SQL, żeby nie trafić w limit wierszy PostgREST przy dużych eventach.
CREATE OR REPLACE FUNCTION public.poll_option_counts(p_poll_ids uuid[])
RETURNS TABLE (poll_id uuid, option_id text, votes bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT pa.poll_id, pa.selected_option_id, count(*)
  FROM public.poll_answers pa
  WHERE pa.poll_id = ANY (p_poll_ids) AND pa.selected_option_id IS NOT NULL
  GROUP BY pa.poll_id, pa.selected_option_id;
$$;
REVOKE ALL ON FUNCTION public.poll_option_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_option_counts(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.session_engagement_summary(p_event_id uuid)
RETURNS TABLE (
  session_id uuid,
  questions bigint,
  visible_questions bigint,
  ratings bigint,
  avg_rating numeric,
  open_polls bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT s.id,
         (SELECT count(*) FROM public.questions q WHERE q.session_id = s.id),
         (SELECT count(*) FROM public.questions q WHERE q.session_id = s.id AND q.status <> 'hidden'),
         (SELECT count(*) FROM public.feedback f WHERE f.session_id = s.id),
         (SELECT round(avg(f.rating)::numeric, 2) FROM public.feedback f WHERE f.session_id = s.id),
         (SELECT count(*) FROM public.polls p WHERE p.session_id = s.id AND p.status = 'open')
  FROM public.sessions s
  WHERE s.event_id = p_event_id;
$$;
REVOKE ALL ON FUNCTION public.session_engagement_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_engagement_summary(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
