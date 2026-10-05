import { NextResponse } from "next/server";
import { getPartnerContext, signedMaterialUrl } from "@/lib/partner-portal";

// Podgląd własnego materiału przez partnera (także przed akceptacją).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ partnerId: string; materialId: string }> },
) {
  const { partnerId, materialId } = await params;
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedMaterialUrl(materialId, partnerId, false);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(url);
}
