-- Zawieszenie konta — egzekwowanie w bazie (druga warstwa obok middleware i kodu serwera).
-- Idempotentna. Wymaga migracji 20261003100000_super_admin.sql (funkcja is_current_user_suspended).
--
-- Polityki RESTRICTIVE łączą się przez AND z istniejącymi politykami organizatora:
-- zawieszone konto (rola authenticated) nie może nic zapisać w tabelach organizatora,
-- nawet gdyby ominęło middleware. Odczyty bez zmian (na nich opiera się przekierowanie
-- na /suspended). service_role (panel operatora, webhooki) omija RLS — bez wpływu.
-- Uczestnicy i odwiedzający nie są rolą authenticated — bez wpływu.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations',
    'events',
    'sessions',
    'speakers',
    'session_speakers',
    'partners',
    'event_content_sections',
    'event_message_templates',
    'attendees'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "suspended account cannot insert" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "suspended account cannot insert" ON public.%I AS RESTRICTIVE '
      'FOR INSERT TO authenticated WITH CHECK (NOT public.is_current_user_suspended())', t);

    EXECUTE format('DROP POLICY IF EXISTS "suspended account cannot update" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "suspended account cannot update" ON public.%I AS RESTRICTIVE '
      'FOR UPDATE TO authenticated USING (NOT public.is_current_user_suspended()) '
      'WITH CHECK (NOT public.is_current_user_suspended())', t);

    EXECUTE format('DROP POLICY IF EXISTS "suspended account cannot delete" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "suspended account cannot delete" ON public.%I AS RESTRICTIVE '
      'FOR DELETE TO authenticated USING (NOT public.is_current_user_suspended())', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
