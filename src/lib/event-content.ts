import { createClient } from "@/lib/supabase/server";

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
