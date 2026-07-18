import { createClient } from "@/lib/supabase/server";

export type AttendeeStatus = "pending" | "approved" | "rejected";

export type Attendee = {
  id: string;
  event_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  industry: string | null;
  interests: string[] | null;
  goal: string | null;
  looking_for: string | null;
  avatar_url: string | null;
  gdpr_consent_at: string | null;
  marketing_consent: boolean;
  networking_visible: boolean;
  points: number;
  level: string;
  status: AttendeeStatus;
  qr_code_token: string;
  contact_code: string;
  checked_in_at: string | null;
  matches_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getEventAttendees(eventId: string): Promise<Attendee[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendees")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
