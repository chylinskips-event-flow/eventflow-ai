import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Partner = {
  id: string;
  event_id: string;
  user_id: string | null;
  name: string;
  logo_url: string | null;
  description: string | null;
  tier: string | null;
  booth_location: string | null;
  qr_code_token: string;
  created_at: string;
  updated_at: string;
};

export async function getEventPartners(eventId: string): Promise<Partner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("partners")
    .select("*")
    .eq("event_id", eventId)
    .order("name", { ascending: true });

  return data ?? [];
}

export async function getPartnerById(
  eventId: string,
  partnerId: string,
): Promise<Partner | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("partners")
    .select("*")
    .eq("id", partnerId)
    .eq("event_id", eventId)
    .maybeSingle();

  return data ?? null;
}

/**
 * Liczba check-inów per partner. checkins ma RLS deny-all (service_role), więc
 * czytamy adminem; zawężamy do partnerów TEGO eventu przez embed (checkins nie
 * ma własnego event_id). Zwraca mapę partnerId → liczba.
 */
export async function getPartnerCheckinCounts(
  eventId: string,
): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("checkins")
    .select("partner_id, partners!inner(event_id)")
    .eq("partners.event_id", eventId);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { partner_id: string }[]) {
    counts[row.partner_id] = (counts[row.partner_id] ?? 0) + 1;
  }
  return counts;
}
