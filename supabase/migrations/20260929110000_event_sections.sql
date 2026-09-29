-- Typed editable sections for event public pages (page builder MVP)
CREATE TABLE IF NOT EXISTS public.event_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type text NOT NULL,
  position int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  content jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_sections_event_id_position_idx
  ON public.event_sections(event_id, position);

-- deny-all: all access goes through service_role with ownership checks in code
ALTER TABLE public.event_sections ENABLE ROW LEVEL SECURITY;
