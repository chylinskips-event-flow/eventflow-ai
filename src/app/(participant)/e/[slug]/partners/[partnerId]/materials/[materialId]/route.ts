import { NextResponse } from "next/server";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedMaterialUrl } from "@/lib/partner-portal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pobranie materiału partnera: tylko zaakceptowany, partner z tego eventu, event publiczny
// albo uczestnik zalogowany. Plik z prywatnego bucketu przez krótki podpisany URL.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; partnerId: string; materialId: string }> },
) {
  const { slug, partnerId, materialId } = await params;
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!UUID.test(partnerId) || !UUID.test(materialId)) return notFound;

  const event = await getEventBySlugForRegistration(slug);
  if (!event) return notFound;
  const isPublic = event.status === "published" || event.status === "live";
  if (!isPublic && !(await getCurrentAttendee(slug))) return notFound;

  const { data: material } = await createAdminClient()
    .from("partner_materials")
    .select("id")
    .eq("id", materialId)
    .eq("partner_id", partnerId)
    .eq("event_id", event.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!material) return notFound;

  const url = await signedMaterialUrl(materialId, partnerId, true);
  return url ? NextResponse.redirect(url) : notFound;
}
