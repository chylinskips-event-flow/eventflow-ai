-- Usunięcie uczestnika zwalnia jego miejsce w puli biletów.
--
-- 1. release_deleted_attendee_tickets: wywoływana przed usunięciem rekordu uczestnika (samoobsługa
--    RODO albo panel organizatora). Bilety wydane bez płatności (darmowe / rabat 100%) są zwalniane
--    tak samo jak przy odrzuceniu zgłoszenia (release_rejected_attendee_tickets: bilet anulowany,
--    miejsce i użycie kodu wracają, zamówienie na 0 zł anulowane). Pozostałe ważne bilety tego
--    uczestnika w tym wydarzeniu (opłacone) są anulowane, a miejsce wraca do puli. Zamówienia
--    opłacone nie są zmieniane — o ewentualnym zwrocie decyduje organizator.
-- 2. get_ticket_types_with_availability: paid_quantity nie liczy anulowanych biletów z opłaconych
--    zamówień, więc zwolnione miejsce jest widoczne na stronie wydarzenia (spójnie z pulą).
--
-- Funkcje wywoływane wyłącznie z serwera (service_role); anon/authenticated nie mają EXECUTE.
-- Zgodne z kodem sprzed zmiany: nowa funkcja nie jest przez niego wołana, a paid_quantity zmienia
-- się tylko dla biletów anulowanych przy opłaconym zamówieniu (wcześniej taki stan nie powstawał).

-- ── 1. Zwolnienie biletów usuwanego uczestnika ──────────────────────────────
-- Zwraca liczbę anulowanych biletów (0, gdy nie było czego zwalniać — wywołanie idempotentne).
CREATE OR REPLACE FUNCTION public.release_deleted_attendee_tickets(
  p_event_id    uuid,
  p_attendee_id uuid
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_ticket record;
  v_count  int;
BEGIN
  -- Bilety bez płatności: pełne zwolnienie (miejsce, użycie kodu, zamówienie na 0 zł).
  v_count := public.release_rejected_attendee_tickets(p_event_id, p_attendee_id);

  -- Pozostałe ważne bilety: tylko anulowanie biletu i zwrot miejsca do puli.
  FOR v_ticket IN
    SELECT t.id, t.ticket_type_id, tt.quantity_total
      FROM public.tickets t
      JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
     WHERE t.attendee_id = p_attendee_id
       AND t.event_id = p_event_id
       AND t.status = 'valid'
     ORDER BY t.ticket_type_id
     FOR UPDATE OF t
  LOOP
    UPDATE public.tickets SET status = 'cancelled' WHERE id = v_ticket.id;
    -- Pula jest rezerwowana tylko dla typów z limitem (jak przy wydawaniu biletu).
    IF v_ticket.quantity_total IS NOT NULL THEN
      PERFORM public.unreserve_ticket_quantity(v_ticket.ticket_type_id, 1);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_deleted_attendee_tickets(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_deleted_attendee_tickets(uuid, uuid) TO service_role;

-- ── 2. Dostępność biletów bez anulowanych miejsc ────────────────────────────
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
    GREATEST(0,
      COALESCE((
        SELECT SUM(oi.quantity)::int
        FROM   public.order_items oi
        JOIN   public.orders o ON o.id = oi.order_id
        WHERE  oi.ticket_type_id = tt.id
          AND  o.status = 'paid'
      ), 0)
      - COALESCE((
        SELECT COUNT(*)::int
        FROM   public.tickets t
        JOIN   public.orders o ON o.id = t.order_id
        WHERE  t.ticket_type_id = tt.id
          AND  t.status = 'cancelled'
          AND  o.status = 'paid'
      ), 0)
    ) AS paid_quantity,
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
