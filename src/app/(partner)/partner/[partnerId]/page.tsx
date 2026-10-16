import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
import { formatDate, formatDateTime, getCurrentTimestamp, toDateTimeLocalValue } from "@/lib/format";
import { ensureDefaultCatalog, getBoothRequest, getCatalog, getLogisticsSettings } from "@/lib/booth-requests";
import { includedFor, isAfterDeadline, logisticsRangeLabel } from "@/lib/booth-requests-core";
import type { BoothRequestView } from "./booth-request-card";
import { PartnerPanel } from "./partner-panel";

export default async function PartnerPanelPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) {
    if (!(await getAuthUser())) redirect("/partner/login");
    // /partner rozstrzyga: inny panel, „dostęp cofnięty” albo brak dostępu.
    redirect("/partner");
  }

  await ensureDefaultCatalog(ctx.event.id);
  const [draft, materials, contact, , settings, catalog, request] = await Promise.all([
    getProfileDraft(partnerId),
    getPartnerMaterials(partnerId),
    getPartnerContact(partnerId),
    touchPartnerAccess(ctx.accessId),
    getLogisticsSettings(ctx.event.id),
    getCatalog(ctx.event.id),
    getBoothRequest(partnerId),
  ]);
  const tz = ctx.event.timezone;
  const local = (v: string | null) => toDateTimeLocalValue(v, tz);
  const boothRequest: BoothRequestView | null = request && {
    items: request.items,
    crew_count: request.crew_count,
    setup_start: local(request.setup_start),
    setup_end: local(request.setup_end),
    teardown_start: local(request.teardown_start),
    teardown_end: local(request.teardown_end),
    vehicle: request.vehicle,
    vehicle_note: request.vehicle_note,
    submittedAt: formatDateTime(request.submitted_at, tz),
    lateChange: !!request.late_change_at,
  };
  const range = (from: string | null, to: string | null) => logisticsRangeLabel(from, to, tz);
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
      booth={{
        catalog: catalog.map((c) => ({
          id: c.id,
          name: c.name,
          unit: c.unit,
          description: c.description,
          active: c.active,
          included: includedFor(c, ctx.partner.tier),
        })),
        request: boothRequest,
        deadlineLabel: formatDateTime(settings.request_deadline, tz),
        locked: isAfterDeadline(settings.request_deadline, getCurrentTimestamp()),
        setupRange: range(settings.setup_from, settings.setup_to),
        teardownRange: range(settings.teardown_from, settings.teardown_to),
      }}
    />
  );
}
