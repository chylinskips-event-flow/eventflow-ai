-- Tickets & Payments module (Przelewy24, MVP)

-- P24 config per organizer (secrets encrypted in application layer)
CREATE TABLE IF NOT EXISTS public.organizer_payment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'p24',
  pos_id text NOT NULL DEFAULT '',
  merchant_id text NOT NULL DEFAULT '',
  api_key_enc text NOT NULL DEFAULT '',
  crc_enc text NOT NULL DEFAULT '',
  sandbox boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizer_payment_config_org_provider_idx
  ON public.organizer_payment_config(organization_id, provider);

ALTER TABLE public.organizer_payment_config ENABLE ROW LEVEL SECURITY;

-- Ticket types (per event)
CREATE TABLE IF NOT EXISTS public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price int NOT NULL DEFAULT 0,      -- grosz (PLN * 100); 0 = free
  currency text NOT NULL DEFAULT 'PLN',
  quantity_total int,                 -- NULL = unlimited
  quantity_sold int NOT NULL DEFAULT 0,
  sales_start timestamptz,
  sales_end timestamptz,
  position int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_types_event_id_idx ON public.ticket_types(event_id);
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

-- Discount codes (per event)
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('percent', 'amount')),
  value int NOT NULL,                 -- percent (0-100) or grosze
  max_uses int,                       -- NULL = unlimited
  uses_count int NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_event_code_idx
  ON public.discount_codes(event_id, lower(code));

CREATE INDEX IF NOT EXISTS discount_codes_event_id_idx ON public.discount_codes(event_id);
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  invoice_data jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  total_amount int NOT NULL,          -- grosze
  currency text NOT NULL DEFAULT 'PLN',
  p24_session_id text NOT NULL UNIQUE,
  p24_token text,
  p24_order_id text,
  discount_code_id uuid REFERENCES public.discount_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS orders_event_id_idx ON public.orders(event_id);
CREATE INDEX IF NOT EXISTS orders_p24_session_id_idx ON public.orders(p24_session_id);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Order items (line items)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  quantity int NOT NULL CHECK (quantity > 0),
  unit_price int NOT NULL,            -- snapshot grosze
  line_total int NOT NULL
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Tickets (one row = one physical ticket / seat)
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  holder_name text NOT NULL,
  holder_email text NOT NULL,
  -- ticket_token = attendees.check_in_token → reception scanner unchanged
  ticket_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  attendee_id uuid REFERENCES public.attendees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid','cancelled','refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_order_id_idx ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS tickets_event_id_idx ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS tickets_ticket_token_idx ON public.tickets(ticket_token);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Atomic quantity reservation (prevents oversell)
CREATE OR REPLACE FUNCTION public.try_reserve_ticket_quantity(
  p_ticket_type_id uuid,
  p_quantity int
) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ticket_types
     SET quantity_sold = quantity_sold + p_quantity,
         updated_at = now()
   WHERE id = p_ticket_type_id
     AND enabled = true
     AND (quantity_total IS NULL OR quantity_sold + p_quantity <= quantity_total);
  RETURN FOUND;
END;
$$;

-- Release reserved quantity (used on failed/cancelled order)
CREATE OR REPLACE FUNCTION public.unreserve_ticket_quantity(
  p_ticket_type_id uuid,
  p_quantity int
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ticket_types
     SET quantity_sold = GREATEST(0, quantity_sold - p_quantity),
         updated_at = now()
   WHERE id = p_ticket_type_id;
END;
$$;
