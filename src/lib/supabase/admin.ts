/**
 * ⚠️ OSTRZEŻENIE — KLIENT SERVICE ROLE ⚠️
 *
 * Ten klient używa SUPABASE_SERVICE_ROLE_KEY i CAŁKOWICIE OMIJA Row Level Security (RLS).
 * Ma pełny dostęp administracyjny do bazy danych.
 *
 * - Może być używany WYŁĄCZNIE po stronie serwera: w Server Actions i Route Handlers.
 * - NIGDY nie importuj tego pliku w komponencie klienckim ("use client") ani w kodzie,
 *   który może trafić do bundla przeglądarki — wyciek service_role key = pełna
 *   kompromitacja bazy danych.
 * - Jeśli nie potrzebujesz pomijać RLS, użyj klienta z `server.ts` lub `client.ts`.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
