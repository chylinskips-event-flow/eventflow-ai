-- Bazowe uprawnienia domyślne, jak w starszych projektach Supabase.
--
-- Produkcja powstała, gdy Supabase automatycznie nadawał rolom anon, authenticated
-- i service_role uprawnienia do nowych tabel, sekwencji i funkcji w schemacie public
-- (dostęp i tak ogranicza RLS). Nowe projekty tego już nie robią, a migracje
-- w tym repozytorium zakładają stare zachowanie — bez tego pliku świeży projekt
-- (np. osobna baza dla Preview) zwraca „permission denied” dla każdej tabeli.
--
-- Plik ma najwcześniejszy znacznik czasu, więc w świeżej bazie wykonuje się przed
-- wszystkimi tabelami i funkcjami. Późniejsze REVOKE w migracjach działają tak samo
-- jak na produkcji. Zmienia tylko uprawnienia DOMYŚLNE dla przyszłych obiektów
-- (nie nadaje nic istniejącym), więc na produkcji jest zbędny i nieszkodliwy.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
