import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee } from "@/lib/attendees";

export const ATTENDEE_TOKEN_COOKIE = "eventflow_attendee_token";
export const ATTENDEE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dni

/**
 * Pobiera attendee po qr_code_token, weryfikując JEDNYM zapytaniem (JOIN
 * przez events!inner), że token rzeczywiście należy do eventu o tym slug —
 * zapobiega pomyleniu/podstawieniu tokenu między różnymi eventami.
 *
 * Używa service_role: RLS nie jest w stanie bezpiecznie wyrazić "anon znał
 * poprawny token" — polityka `using (true)` ujawniłaby całą tabelę. Token
 * (losowy UUID) jest tu właściwą granicą bezpieczeństwa, identycznie jak
 * przy linku rejestracyjnym (getEventBySlugForRegistration).
 */
export async function getAttendeeByTokenAndSlug(
  token: string,
  slug: string,
): Promise<Attendee | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendees")
    .select("*, events!inner(slug)")
    .eq("qr_code_token", token)
    .eq("events.slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const { events, ...attendee } = data as Attendee & { events: { slug: string } };
  void events;
  return attendee;
}

/**
 * Odczytuje cookie tokenu uczestnika i weryfikuje go względem danego eventu
 * (po slug) — zwraca attendee tylko jeśli token istnieje, należy do tego
 * eventu, ORAZ status === 'approved'. Fundament dla innych stron na
 * /e/[slug]/* (np. agenda, "moja agenda" w przyszłych krokach).
 */
export async function getCurrentAttendee(slug: string): Promise<Attendee | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ATTENDEE_TOKEN_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const attendee = await getAttendeeByTokenAndSlug(token, slug);

  if (!attendee || attendee.status !== "approved") {
    return null;
  }

  return attendee;
}
