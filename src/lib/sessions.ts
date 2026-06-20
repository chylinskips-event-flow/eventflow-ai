import { createClient } from "@/lib/supabase/server";

export type Session = {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  track: string | null;
  room: string | null;
  starts_at: string | null;
  ends_at: string | null;
  speaker_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getEventSessions(eventId: string): Promise<Session[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true });

  return data ?? [];
}
