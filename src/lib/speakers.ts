import { createClient } from "@/lib/supabase/server";

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
