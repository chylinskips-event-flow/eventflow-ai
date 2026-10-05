-- #10 Faza A — panel partnera: konto partnera (passwordless, Supabase Auth magic link),
-- profil publiczny z akceptacją organizatora, materiały do pobrania, kontakt wewnętrzny.
-- Idempotentna. Zastosować w Supabase PRZED / razem z deployem (kończy się NOTIFY pgrst).
--
-- Zasada: public.partners ma publiczny SELECT (strona eventu) → trzyma WYŁĄCZNIE treść
-- zatwierdzoną przez organizatora. Szkic partnera, kontakt wewnętrzny, dostępy i materiały
-- żyją w osobnych tabelach z RLS deny-all (dostęp: server actions po autoryzacji + service_role).
-- Tabele mają PK `id` (nie złożony z FK), więc PostgREST nie traktuje ich jako tabel
-- łączących partners↔events (brak PGRST201 w istniejących embedach).

-- ── Kaskada: usunięcie eventu sprząta partnerów (i dalej ich zależności) ─────
ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_event_id_fkey,
  ADD CONSTRAINT partners_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events (id) ON DELETE CASCADE;

-- ── Profil publiczny (zatwierdzony) ────────────────────────────────────────
-- social_links: {"linkedin": "https://…", "facebook": …, "instagram": …, "x": …, "youtube": …}
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS website_url  text,
  ADD COLUMN IF NOT EXISTS offer        text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_social_links_object') THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_social_links_object CHECK (jsonb_typeof(social_links) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_offer_length') THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_offer_length CHECK (offer IS NULL OR char_length(offer) <= 2000);
  END IF;
END $$;

-- ── Dostęp partnera (zaproszenie → konto) ──────────────────────────────────
-- Wiersz = jedna osoba (e-mail) z dostępem do panelu JEDNEGO partnera.
-- Stan: revoked_at → unieważniony; user_id → aktywny; inaczej zaproszony (do invite_expires_at).
CREATE TABLE IF NOT EXISTS public.partner_access (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  email             text NOT NULL,
  invite_token      uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  invited_at        timestamptz NOT NULL DEFAULT now(),
  user_id           uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  accepted_at       timestamptz,
  last_seen_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_access_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 254)
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_access_invite_token_key ON public.partner_access (invite_token);
-- Jedna aktywna (nieunieważniona) pozycja na e-mail u danego partnera.
CREATE UNIQUE INDEX IF NOT EXISTS partner_access_active_email_key
  ON public.partner_access (partner_id, lower(email)) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS partner_access_user_idx ON public.partner_access (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS partner_access_event_idx ON public.partner_access (event_id);
ALTER TABLE public.partner_access ENABLE ROW LEVEL SECURITY;

-- ── Kontakt wewnętrzny partnera (widzi organizator, nie uczestnicy) ─────────
CREATE TABLE IF NOT EXISTS public.partner_contacts (
  partner_id    uuid PRIMARY KEY REFERENCES public.partners (id) ON DELETE CASCADE,
  contact_name  text,
  contact_email text,
  contact_phone text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_contacts_lengths CHECK (
    coalesce(char_length(contact_name), 0) <= 200
    AND coalesce(char_length(contact_email), 0) <= 254
    AND coalesce(char_length(contact_phone), 0) <= 40
  )
);
ALTER TABLE public.partner_contacts ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.partner_contacts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.partner_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Szkic profilu do akceptacji ────────────────────────────────────────────
-- Jeden szkic na partnera. status: pending (czeka na organizatora) | rejected (z uwagą).
-- Zatwierdzenie kopiuje pola do public.partners i usuwa szkic.
CREATE TABLE IF NOT EXISTS public.partner_profile_drafts (
  partner_id   uuid PRIMARY KEY REFERENCES public.partners (id) ON DELETE CASCADE,
  name         text NOT NULL,
  logo_url     text,
  description  text,
  website_url  text,
  offer        text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rejected')),
  review_note  text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_profile_drafts_lengths CHECK (
    char_length(name) BETWEEN 1 AND 200
    AND coalesce(char_length(description), 0) <= 5000
    AND coalesce(char_length(offer), 0) <= 2000
    AND coalesce(char_length(website_url), 0) <= 500
    AND coalesce(char_length(review_note), 0) <= 1000
  ),
  CONSTRAINT partner_profile_drafts_social_object CHECK (jsonb_typeof(social_links) = 'object')
);
ALTER TABLE public.partner_profile_drafts ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON public.partner_profile_drafts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.partner_profile_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Materiały do pobrania ──────────────────────────────────────────────────
-- Pliki w PRYWATNYM buckecie partner-materials; pobranie przez podpisany URL po
-- sprawdzeniu statusu (approved) i dostępności eventu. status: pending|approved|rejected.
CREATE TABLE IF NOT EXISTS public.partner_materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  title       text NOT NULL,
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  bigint NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_materials_lengths CHECK (
    char_length(title) BETWEEN 1 AND 200
    AND char_length(file_name) BETWEEN 1 AND 255
    AND size_bytes > 0
  )
);
CREATE INDEX IF NOT EXISTS partner_materials_partner_idx ON public.partner_materials (partner_id, created_at);
CREATE INDEX IF NOT EXISTS partner_materials_event_idx ON public.partner_materials (event_id);
ALTER TABLE public.partner_materials ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-materials', 'partner-materials', false)
ON CONFLICT (id) DO NOTHING;

-- ── Plany: panel partnera w Business i Enterprise ──────────────────────────
-- Tylko gdy klucza jeszcze nie ma (ręczne zmiany w bazie nie są nadpisywane).
UPDATE public.plans
SET features = features || jsonb_build_object('partner_portal', key IN ('business', 'enterprise'))
WHERE NOT (features ? 'partner_portal');

NOTIFY pgrst, 'reload schema';
