import { createAdminClient } from "@/lib/supabase/admin";

export async function getPaidOrderCount(eventId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "paid");
  return count ?? 0;
}
