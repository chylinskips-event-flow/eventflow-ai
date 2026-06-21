import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Speaker = {
  id: string;
  event_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  company: string | null;
  created_at: string;
  updated_at: string;
};

export async function getEventSpeakers(eventId: string): Promise<Speaker[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("speakers")
    .select("*")
    .eq("event_id", eventId)
    .order("last_name", { ascending: true });

  return data ?? [];
}

/** Wariant dla stron uczestnika (service_role) — patrz getEventSessionsForParticipant. */
export async function getEventSpeakersForParticipant(
  eventId: string,
): Promise<Speaker[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("speakers")
    .select("*")
    .eq("event_id", eventId)
    .order("last_name", { ascending: true });

  return data ?? [];
}
