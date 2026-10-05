import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getAuthUser,
  getPartnerContact,
  getPartnerContext,
  getPartnerMaterials,
  getProfileDraft,
  publishedProfile,
  touchPartnerAccess,
} from "@/lib/partner-portal";
import { partnerTierLabel } from "@/lib/partner-options";
import { getOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/format";
import { PartnerPanel } from "./partner-panel";

export default async function PartnerPanelPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) {
    if (!(await getAuthUser())) redirect("/partner/login");
    notFound();
  }

  const [draft, materials, contact] = await Promise.all([
    getProfileDraft(partnerId),
    getPartnerMaterials(partnerId),
    getPartnerContact(partnerId),
    touchPartnerAccess(ctx.accessId),
  ]);
  const isPublic = ctx.event.status === "published" || ctx.event.status === "live";
  const origin = getOrigin(await headers());

  return (
    <PartnerPanel
      partnerId={partnerId}
      userEmail={ctx.user.email}
      eventName={ctx.event.name}
      eventDate={formatDate(ctx.event.starts_at, ctx.event.timezone)}
      tier={partnerTierLabel(ctx.partner.tier)}
      boothLocation={ctx.partner.booth_location}
      published={publishedProfile(ctx.partner)}
      draft={draft}
      materials={materials}
      contact={contact}
      publicUrl={isPublic ? `${origin}/e/${ctx.event.slug}/partners/${partnerId}` : null}
    />
  );
}
