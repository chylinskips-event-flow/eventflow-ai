import { NextResponse } from "next/server";
import { getOwnEvent } from "@/lib/events";
import { hasFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedMaterialUrl } from "@/lib/partner-portal";

// Podgląd materiału partnera przez organizatora (także przed akceptacją).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; partnerId: string; materialId: string }> },
) {
  const { eventId, partnerId, materialId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event || !(await hasFeature(event.organization_id, "partner_portal"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: partner } = await createAdminClient()
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = await signedMaterialUrl(materialId, partnerId, false);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(url);
}
