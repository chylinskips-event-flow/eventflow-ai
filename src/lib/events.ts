import { createClient } from "@/lib/supabase/server";

export type EventStatus =
  | "draft"
  | "published"
  | "live"
  | "completed"
  | "archived";

export type Event = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  status: EventStatus;
  logo_url: string | null;
  primary_color: string | null;
  location: string | null;
  registration_open: boolean;
  created_at: string;
  updated_at: string;
};

export async function getOrganizationEvents(
  organizationId: string,
): Promise<Event[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: false });

  return data ?? [];
}

export async function getOwnEvent(eventId: string): Promise<Event | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}
