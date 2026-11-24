-- Kod rabatowy przypisany do typu biletu nie może po usunięciu tego typu zacząć działać na
-- wszystkie typy (klucz obcy discount_codes.ticket_type_id ma ON DELETE SET NULL, a NULL oznacza
-- „dowolny typ biletu”). Przed usunięciem typu przypisane do niego kody są wyłączane; organizator
-- może je świadomie włączyć ponownie. Gdy usunięcie się nie powiedzie (np. typ ma zamówienia),
-- wyłączenie jest wycofywane razem z nim.
-- Zgodne z kodem sprzed zmiany: wyzwalacz działa tylko przy usuwaniu typu biletu.

CREATE OR REPLACE FUNCTION public.disable_discount_codes_of_deleted_ticket_type()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.discount_codes
     SET enabled = false,
         updated_at = now()
   WHERE ticket_type_id = OLD.id
     AND enabled = true;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_discount_codes_of_deleted_ticket_type() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ticket_types_disable_discount_codes ON public.ticket_types;
CREATE TRIGGER ticket_types_disable_discount_codes
  BEFORE DELETE ON public.ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION public.disable_discount_codes_of_deleted_ticket_type();
