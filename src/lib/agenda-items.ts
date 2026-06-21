import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Zwraca zbiór session_id dodanych przez danego uczestnika do jego agendy.
 * Używa service_role — uczestnik nie ma sesji Supabase Auth, więc RLS nie ma
 * jak zweryfikować "kto pyta"; tożsamość jest już ustalona server-side przez
 * getCurrentAttendee() przed wywołaniem tej funkcji.
 */
export async function getAttendeeAgendaSessionIds(
  attendeeId: string,
): Promise<Set<string>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("agenda_items")
    .select("session_id")
    .eq("attendee_id", attendeeId);

  return new Set((data ?? []).map((row) => row.session_id as string));
}
