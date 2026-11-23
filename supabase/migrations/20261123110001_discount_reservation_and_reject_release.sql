-- Kody rabatowe i odrzucanie zgłoszeń:
--
-- 1. create_pending_order_with_discount: zamówienie oczekujące na płatność z kodem rabatowym jest
--    tworzone w tej samej transakcji, w której sprawdzany jest limit max_uses (wiersz kodu
--    zablokowany FOR UPDATE; liczą się potwierdzone użycia + trwające płatności z tym kodem).
--    Dzięki temu równoległe zakupy nie przekraczają limitu.
-- 2. try_use_discount_code (rabat 100%, bez płatności): ten sam limit co wyżej — uwzględnia
--    trwające płatności z kodem, a nie tylko uses_count.
-- 3. confirm_paid_order nadal zwiększa uses_count bez warunku: pieniądze są już pobrane, więc
--    przekroczenie limitu przez płatność potwierdzoną po wygaśnięciu rezerwacji jest akceptowane.
-- 4. release_rejected_attendee_tickets: po odrzuceniu zgłoszenia uczestnika z biletem wydanym bez
--    płatności (bilet darmowy / rabat 100%) bilet jest anulowany, miejsce wraca do puli, użycie
--    kodu rabatowego jest oddawane, a zamówienie na 0 zł oznaczane jako anulowane. Zamówienia
--    opłacone (kwota > 0) nie są ruszane — o zwrocie decyduje organizator.
--
-- Funkcje są wywoływane wyłącznie z serwera (service_role); anon/authenticated nie mają EXECUTE.

-- ── 1. Zamówienie oczekujące z rezerwacją użycia kodu ───────────────────────
-- Zwraca id utworzonego zamówienia albo NULL, gdy kod jest wyłączony lub wyczerpany.
CREATE OR REPLACE FUNCTION public.create_pending_order_with_discount(
  p_event_id          uuid,
  p_discount_code_id  uuid,
  p_buyer_first_name  text,
  p_buyer_last_name   text,
  p_buyer_email       text,
  p_marketing_consent boolean,
  p_total_amount      int,
  p_p24_session_id    text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_max      int;
  v_used     int;
  v_enabled  boolean;
  v_pending  int;
  v_order_id uuid;
BEGIN
  SELECT max_uses, uses_count, enabled
    INTO v_max, v_used, v_enabled
    FROM public.discount_codes
   WHERE id = p_discount_code_id
     AND event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND OR NOT v_enabled THEN
    RETURN NULL;
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*)::int
      INTO v_pending
      FROM public.orders
     WHERE discount_code_id = p_discount_code_id
       AND status = 'pending'
       AND created_at >= now() - INTERVAL '20 minutes';

    IF v_used + v_pending >= v_max THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.orders (
    event_id, buyer_name, buyer_first_name, buyer_last_name, buyer_email, marketing_consent,
    status, total_amount, currency, p24_session_id, discount_code_id
  ) VALUES (
    p_event_id, p_buyer_first_name || ' ' || p_buyer_last_name, p_buyer_first_name,
    p_buyer_last_name, p_buyer_email, p_marketing_consent,
    'pending', p_total_amount, 'PLN', p_p24_session_id, p_discount_code_id
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_order_with_discount(uuid, uuid, text, text, text, boolean, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_order_with_discount(uuid, uuid, text, text, text, boolean, int, text)
  TO service_role;

-- ── 2. Użycie kodu bez płatności — limit z trwającymi płatnościami ──────────
CREATE OR REPLACE FUNCTION public.try_use_discount_code(p_code_id uuid)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_max     int;
  v_used    int;
  v_enabled boolean;
  v_pending int := 0;
BEGIN
  SELECT max_uses, uses_count, enabled
    INTO v_max, v_used, v_enabled
    FROM public.discount_codes
   WHERE id = p_code_id
   FOR UPDATE;

  IF NOT FOUND OR NOT v_enabled THEN
    RETURN false;
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*)::int
      INTO v_pending
      FROM public.orders
     WHERE discount_code_id = p_code_id
       AND status = 'pending'
       AND created_at >= now() - INTERVAL '20 minutes';

    IF v_used + v_pending >= v_max THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.discount_codes
     SET uses_count = uses_count + 1,
         updated_at = now()
   WHERE id = p_code_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.try_use_discount_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_use_discount_code(uuid) TO service_role;

-- ── 3. Dokumentacja zachowania confirm_paid_order ───────────────────────────
COMMENT ON FUNCTION public.confirm_paid_order(uuid, text) IS
  'Potwierdza opłacone zamówienie. Użycie kodu rabatowego jest zliczane bez sprawdzania max_uses: '
  'płatność jest już pobrana, więc przekroczenie limitu przez płatność potwierdzoną po wygaśnięciu '
  'rezerwacji (20 min) jest akceptowane.';

-- ── 4. Zwolnienie biletu bez płatności po odrzuceniu zgłoszenia ─────────────
-- Zwraca liczbę anulowanych biletów (0, gdy nie było czego zwalniać — wywołanie idempotentne).
CREATE OR REPLACE FUNCTION public.release_rejected_attendee_tickets(
  p_event_id    uuid,
  p_attendee_id uuid
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_ticket record;
  v_order  record;
  v_count  int := 0;
BEGIN
  FOR v_ticket IN
    SELECT t.id, t.ticket_type_id, tt.quantity_total
      FROM public.tickets t
      JOIN public.orders o        ON o.id = t.order_id
      JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
     WHERE t.attendee_id = p_attendee_id
       AND t.event_id = p_event_id
       AND t.status = 'valid'
       AND o.status = 'paid'
       AND o.total_amount = 0
     ORDER BY t.ticket_type_id
     FOR UPDATE OF t, o
  LOOP
    UPDATE public.tickets SET status = 'cancelled' WHERE id = v_ticket.id;
    -- Pula jest rezerwowana tylko dla typów z limitem (jak przy wydawaniu biletu).
    IF v_ticket.quantity_total IS NOT NULL THEN
      PERFORM public.unreserve_ticket_quantity(v_ticket.ticket_type_id, 1);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  -- Zamówienia na 0 zł, w których nie został już żaden ważny bilet.
  FOR v_order IN
    UPDATE public.orders o
       SET status = 'cancelled'
     WHERE o.event_id = p_event_id
       AND o.status = 'paid'
       AND o.total_amount = 0
       AND EXISTS (SELECT 1 FROM public.tickets t
                    WHERE t.order_id = o.id AND t.attendee_id = p_attendee_id)
       AND NOT EXISTS (SELECT 1 FROM public.tickets t
                        WHERE t.order_id = o.id AND t.status = 'valid')
    RETURNING o.discount_code_id
  LOOP
    IF v_order.discount_code_id IS NOT NULL THEN
      PERFORM public.release_discount_code_use(v_order.discount_code_id);
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_rejected_attendee_tickets(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rejected_attendee_tickets(uuid, uuid) TO service_role;
