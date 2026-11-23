-- Bilety i płatności: potwierdzanie zamówień po weryfikacji płatności, licznik kodów rabatowych,
-- dane kupującego na zamówieniu.
--
-- 1. orders: imię i nazwisko kupującego osobno + zgoda marketingowa (bilet wystawiany po płatności
--    ma dane z formularza, a nie zgadywane z jednego napisu).
-- 2. orders.status 'paid_overbooked': płatność potwierdzona, ale pula biletów była już wyczerpana
--    (rezerwacja wygasła). Bilet nie jest wystawiany, organizator dostaje powiadomienie i decyduje
--    o zwrocie. Brak automatycznego zwrotu.
-- 3. try_use_discount_code / release_discount_code_use: atomowe zużycie kodu z limitem max_uses.
-- 4. confirm_paid_order: atomowo oznacza zamówienie jako opłacone (albo paid_overbooked), pilnuje
--    puli dla rezerwacji, które wygasły lub zostały anulowane, i zlicza użycie kodu rabatowego
--    dopiero przy potwierdzonej płatności.
--
-- Funkcje są wywoływane wyłącznie z serwera (service_role); anon/authenticated nie mają EXECUTE.

-- ── 1. Dane kupującego ──────────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_first_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_last_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;

-- ── 2. Status paid_overbooked ───────────────────────────────────────────────
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','paid','paid_overbooked','failed','cancelled','refunded'));

-- ── 3. Kody rabatowe ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.try_use_discount_code(p_code_id uuid)
RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.discount_codes
     SET uses_count = uses_count + 1,
         updated_at = now()
   WHERE id = p_code_id
     AND enabled = true
     AND (max_uses IS NULL OR uses_count < max_uses);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_discount_code_use(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.discount_codes
     SET uses_count = GREATEST(0, uses_count - 1),
         updated_at = now()
   WHERE id = p_code_id;
END;
$$;

REVOKE ALL ON FUNCTION public.try_use_discount_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_use_discount_code(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_discount_code_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_discount_code_use(uuid) TO service_role;

-- ── 4. Potwierdzenie opłaconego zamówienia ──────────────────────────────────
-- Zwraca: 'paid' (wystaw bilety), 'paid_overbooked' (brak miejsc — bez biletów, powiadom
-- organizatora) albo 'noop' (zamówienie już rozliczone albo nie istnieje).
-- Wywoływać dopiero po pozytywnej weryfikacji transakcji u operatora płatności.
CREATE OR REPLACE FUNCTION public.confirm_paid_order(p_order_id uuid, p_p24_order_id text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_status   text;
  v_created  timestamptz;
  v_code     uuid;
  v_holds    boolean;  -- miejsca zamówienia nadal wliczone do quantity_sold
  v_expired  boolean;  -- rezerwacja starsza niż 20 min (inni mogli zająć miejsca)
  v_fits     boolean := true;
  v_item     record;
  v_total    int;
  v_sold     int;
  v_stale    int;
BEGIN
  SELECT status, created_at, discount_code_id
    INTO v_status, v_created, v_code
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND OR v_status NOT IN ('pending', 'cancelled') THEN
    RETURN 'noop';
  END IF;

  v_holds   := v_status = 'pending';
  v_expired := v_created < now() - INTERVAL '20 minutes';

  -- Pula: blokujemy typy biletów w stałej kolejności (jak try_reserve_ticket_quantity).
  FOR v_item IN
    SELECT ticket_type_id, SUM(quantity)::int AS qty
      FROM public.order_items
     WHERE order_id = p_order_id
     GROUP BY ticket_type_id
     ORDER BY ticket_type_id
  LOOP
    SELECT quantity_total, quantity_sold
      INTO v_total, v_sold
      FROM public.ticket_types
     WHERE id = v_item.ticket_type_id
     FOR UPDATE;

    -- Aktywna rezerwacja gwarantuje miejsce; po wygaśnięciu lub anulowaniu trzeba sprawdzić pulę.
    IF v_total IS NOT NULL AND (NOT v_holds OR v_expired) THEN
      SELECT COALESCE(SUM(oi.quantity), 0)::int
        INTO v_stale
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.ticket_type_id = v_item.ticket_type_id
         AND o.id <> p_order_id
         AND o.status = 'pending'
         AND o.created_at < now() - INTERVAL '20 minutes';

      -- Miejsca zajęte przez innych = quantity_sold − wygasłe cudze − własne (jeśli wliczone).
      IF (v_sold - v_stale - CASE WHEN v_holds THEN v_item.qty ELSE 0 END) + v_item.qty > v_total THEN
        v_fits := false;
      END IF;
    END IF;
  END LOOP;

  IF v_fits THEN
    IF NOT v_holds THEN
      -- Anulowane zamówienie oddało miejsca do puli — zajmujemy je ponownie.
      UPDATE public.ticket_types tt
         SET quantity_sold = tt.quantity_sold + s.qty,
             updated_at    = now()
        FROM (SELECT ticket_type_id, SUM(quantity)::int AS qty
                FROM public.order_items
               WHERE order_id = p_order_id
               GROUP BY ticket_type_id) s
       WHERE tt.id = s.ticket_type_id;
    END IF;

    UPDATE public.orders
       SET status = 'paid', p24_order_id = p_p24_order_id, paid_at = now()
     WHERE id = p_order_id;

    -- Użycie kodu liczymy dopiero przy potwierdzonej płatności. Kupujący zapłacił już cenę
    -- po rabacie, więc licznik odzwierciedla faktyczne użycia (limit pilnowany przy starcie płatności).
    IF v_code IS NOT NULL THEN
      UPDATE public.discount_codes
         SET uses_count = uses_count + 1, updated_at = now()
       WHERE id = v_code;
    END IF;

    RETURN 'paid';
  END IF;

  IF v_holds THEN
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

REVOKE ALL ON FUNCTION public.confirm_paid_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_paid_order(uuid, text) TO service_role;
