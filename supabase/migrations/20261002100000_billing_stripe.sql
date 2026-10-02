-- Billing platformy — Faza B: powiązanie ze Stripe + idempotencja webhooków.
-- Idempotentna. Zastosować w Supabase PRZED / razem z deployem (kończy się NOTIFY pgrst).
-- RLS deny-all: dostęp wyłącznie przez service_role.

-- Klient Stripe organizacji (1:1) — tworzony przy pierwszym Checkout, zanim powstanie
-- wiersz w subscriptions. Celowo NIE kolumna w organizations: właściciel ma tam UPDATE
-- przez RLS i mógłby podpiąć cudzego klienta Stripe (dostęp do jego Portalu).
CREATE TABLE IF NOT EXISTS public.billing_customers (
  organization_id    uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

-- Cena Stripe, z której wyliczono plan (diagnostyka / zmiana planu w Portalu).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Dedupe webhooków po event.id — zapis dopiero po udanym przetworzeniu,
-- więc nieudane zdarzenie Stripe może ponowić.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id           text PRIMARY KEY,        -- evt_…
  type         text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
