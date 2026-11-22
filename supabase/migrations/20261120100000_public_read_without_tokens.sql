-- Publiczny odczyt bez tokenów. Idempotentna, kończy się NOTIFY pgrst.
-- URUCHOMIĆ DOPIERO PO WDROŻENIU KODU z tej zmiany (strona wydarzenia czyta wtedy dane
-- przez service_role) — wcześniej publiczna strona straciłaby agendę, prelegentów i partnerów.
--
-- Polityki „public can view … of published or live events” dawały rolom anon i authenticated
-- odczyt CAŁYCH wierszy, razem z kolumnami-sekretami: events.reception_token (link recepcji),
-- sessions.qa_present_token (rzutnik Q&A), partners.qr_code_token (wizyta na stoisku),
-- quests.config (odpowiedzi quizów, hasła stoisk). Klucz anon jest jawny w przeglądarce.
-- Aplikacja nie potrzebuje tych polityk: strony publiczne czytają przez service_role,
-- a panel organizatora przez polityki „organizer can … own events”.
-- Polityki innych tabel (prelegenci, treść, ankiety, nagrody) sprawdzają status wydarzenia
-- podzapytaniem do events, więc dla anon przestają cokolwiek zwracać — to zamierzone.

DROP POLICY IF EXISTS "public can view published or live events" ON public.events;
DROP POLICY IF EXISTS "public can view sessions of published or live events" ON public.sessions;
DROP POLICY IF EXISTS "public can view partners of published or live events" ON public.partners;
DROP POLICY IF EXISTS "public can view quests of published or live events" ON public.quests;

NOTIFY pgrst, 'reload schema';
