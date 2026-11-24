-- Potwierdzona płatność przy osiągniętym limicie uczestników wydarzenia (limit planu
-- organizatora): zamówienie trafia na tę samą ścieżkę co płatność bez wolnych miejsc w puli
-- ('paid_overbooked' — bez biletu, organizator dostaje powiadomienie i decyduje o zwrocie).
--
-- mark_order_overbooked: atomowo oznacza oczekujące albo anulowane zamówienie jako
-- 'paid_overbooked' i oddaje do puli miejsca, które zamówienie jeszcze trzymało (tylko 'pending').
-- Zwraca 'paid_overbooked' albo 'noop' (zamówienie już rozliczone lub nie istnieje).
--
-- Wywoływana wyłącznie z serwera (service_role) po pozytywnej weryfikacji płatności.
-- Zgodna z kodem sprzed zmiany: nowa funkcja, nieużywana przez obecny kod.

CREATE OR REPLACE FUNCTION public.mark_order_overbooked(p_order_id uuid, p_p24_order_id text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status
    INTO v_status
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND OR v_status NOT IN ('pending', 'cancelled') THEN
    RETURN 'noop';
  END IF;

  IF v_status = 'pending' THEN
    -- Zamówienie bez biletów nie zajmuje puli.
    UPDATE public.ticket_types tt
       SET quantity_sold = GREATEST(0, tt.quantity_sold - s.qty),
           updated_at    = now()
      FROM (SELECT ticket_type_id, SUM(quantity)::int AS qty
              FROM public.order_items
             WHERE order_id = p_order_id
             GROUP BY ticket_type_id) s
     WHERE tt.id = s.ticket_type_id;
  END IF;

  UPDATE public.orders
     SET status = 'paid_overbooked', p24_order_id = p_p24_order_id, paid_at = now()
   WHERE id = p_order_id;

  RETURN 'paid_overbooked';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_overbooked(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_overbooked(uuid, text) TO service_role;
