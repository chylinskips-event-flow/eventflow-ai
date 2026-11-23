import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Czy linki obsługi (recepcja, wydawanie posiłków) mogą działać dla tego wydarzenia:
 * wydarzenie nieusunięte, bez zawieszenia wydarzenia ani organizacji.
 * Sprawdzamy po id wydarzenia z tokenu — slug w adresie nie ma tu znaczenia.
 */
export async function isEventOpenForStaff(event: {
  id: string;
  organization_id: string;
  deleted_at: string | null;
}): Promise<boolean> {
  if (event.deleted_at) return false;
  const admin = createAdminClient();
  const [eventSus, orgSus] = await Promise.all([
    admin.from("event_suspensions").select("event_id").eq("event_id", event.id).maybeSingle(),
    admin
      .from("organization_suspensions")
      .select("organization_id")
      .eq("organization_id", event.organization_id)
      .maybeSingle(),
  ]);
  return !eventSus.data && !orgSus.data;
}
