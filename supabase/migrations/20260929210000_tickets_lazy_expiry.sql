-- Pool release v2: lazy expiry in try_reserve + display availability function
-- Replaces cron-based TTL (not available on Vercel Hobby plan).
-- Abandoned checkouts (> 20 min pending) are treated as expired at read/reserve time.

-- ── 1. Updated try_reserve_ticket_quantity ───────────────────────────────────
-- Uses SELECT FOR UPDATE to serialise concurrent reservations for the same
-- ticket type, then subtracts expired pending items from quantity_sold before
-- the availability check. This prevents "soldout" from stale reservations.

CREATE OR REPLACE FUNCTION public.try_reserve_ticket_quantity(
  p_ticket_type_id uuid,
  p_quantity       int
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_total           int;
  v_sold            int;
  v_expired_reserved int;
BEGIN
  -- Lock this ticket type row; concurrent calls for the same type serialise here
  SELECT quantity_total, quantity_sold
  INTO   v_total, v_sold
  FROM   public.ticket_types
  WHERE  id = p_ticket_type_id
    AND  enabled = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Unlimited pool — always allow
  IF v_total IS NULL THEN
    UPDATE public.ticket_types
       SET quantity_sold = quantity_sold + p_quantity,
           updated_at    = now()
     WHERE id = p_ticket_type_id;
    RETURN true;
  END IF;

  -- Count quantity held by expired pending orders (> 20 min old, still 'pending')
  -- These no longer count against available capacity.
  SELECT COALESCE(SUM(oi.quantity), 0)::int
  INTO   v_expired_reserved
  FROM   public.order_items oi
  JOIN   public.orders o ON o.id = oi.order_id
  WHERE  oi.ticket_type_id = p_ticket_type_id
    AND  o.status = 'pending'
    AND  o.created_at < NOW() - INTERVAL '20 minutes';

  -- effective_sold = all reserved/paid minus stale expired holds
  IF (v_sold - v_expired_reserved) + p_quantity > v_total THEN
    RETURN false;
  END IF;

  UPDATE public.ticket_types
     SET quantity_sold = quantity_sold + p_quantity,
         updated_at    = now()
   WHERE id = p_ticket_type_id;

  RETURN true;
END;
$$;

-- ── 2. get_ticket_types_with_availability ────────────────────────────────────
-- Returns ticket types for an event enriched with two extra counters computed
-- directly from order_items (independent of quantity_sold):
--   paid_quantity            – items in paid orders  (= real sales)
--   active_pending_quantity  – items in pending orders newer than 20 min
-- The display layer uses (paid + active_pending) as effective_sold.

CREATE OR REPLACE FUNCTION public.get_ticket_types_with_availability(p_event_id uuid)
RETURNS TABLE (
  id                      uuid,
  event_id                uuid,
  name                    text,
  description             text,
  price                   int,
  currency                text,
  quantity_total          int,
  quantity_sold           int,
  sales_start             timestamptz,
  sales_end               timestamptz,
  "position"              int,
  enabled                 boolean,
  created_at              timestamptz,
  updated_at              timestamptz,
  paid_quantity           int,
  active_pending_quantity int
)
LANGUAGE sql STABLE AS $$
  SELECT
    tt.id,
    tt.event_id,
    tt.name,
    tt.description,
    tt.price,
    tt.currency,
    tt.quantity_total,
    tt.quantity_sold,
    tt.sales_start,
    tt.sales_end,
    tt.position,
    tt.enabled,
    tt.created_at,
    tt.updated_at,
    COALESCE((
      SELECT SUM(oi.quantity)::int
      FROM   public.order_items oi
      JOIN   public.orders o ON o.id = oi.order_id
      WHERE  oi.ticket_type_id = tt.id
        AND  o.status = 'paid'
    ), 0) AS paid_quantity,
    COALESCE((
      SELECT SUM(oi.quantity)::int
      FROM   public.order_items oi
      JOIN   public.orders o ON o.id = oi.order_id
      WHERE  oi.ticket_type_id = tt.id
        AND  o.status = 'pending'
        AND  o.created_at >= NOW() - INTERVAL '20 minutes'
    ), 0) AS active_pending_quantity
  FROM public.ticket_types tt
  WHERE tt.event_id = p_event_id
  ORDER BY tt.position;
$$;
