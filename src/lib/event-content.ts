import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EventContentSection = {
  id: string;
  event_id: string;
  title: string;
  body: string;
  image_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export async function getEventContentSections(
  eventId: string,
): Promise<EventContentSection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_content_sections")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  return data ?? [];
}

/**
 * Wariant service_role dla podglądu draftu przez właściciela eventu. Publiczna
 * polityka RLS ujawnia sekcje tylko dla published/live, więc dla draftu anon
 * dostaje pustą listę. Wywoływać WYŁĄCZNIE po potwierdzeniu własności
 * (isCurrentUserEventOwner) — omija RLS.
 */
export async function getEventContentSectionsForPreview(
  eventId: string,
): Promise<EventContentSection[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("event_content_sections")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  return data ?? [];
}
