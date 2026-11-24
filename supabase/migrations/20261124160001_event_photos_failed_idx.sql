-- Galeria: sprzątanie odrzuconych/porzuconych wysyłek (status 'failed') wybiera je po created_at
-- przy każdym rozpoczęciu wysyłki — indeks częściowy, żeby nie skanować całej tabeli zdjęć.
-- Tylko dodanie indeksu: bez zmian danych i uprawnień, zgodne z dotychczasowym kodem.
CREATE INDEX IF NOT EXISTS event_photos_failed_idx
  ON public.event_photos (created_at)
  WHERE status = 'failed';
