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
import { formatDate, formatDateTime, getCurrentTimestamp } from "@/lib/format";
import { ensureDefaultCatalog, getBoothRequest, getCatalog, getLogisticsSettings } from "@/lib/booth-requests";
import { includedFor, isAfterDeadline, toLocalSlot } from "@/lib/booth-requests-core";
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
  const boothRequest: BoothRequestView | null = request && {
    items: request.items,
    crew_count: request.crew_count,
    setup: toLocalSlot(request.setup_start, request.setup_end, tz),
    teardown: toLocalSlot(request.teardown_start, request.teardown_end, tz),
    setup_note: request.setup_note,
    teardown_note: request.teardown_note,
    vehicle: request.vehicle,
    vehicle_note: request.vehicle_note,
    vehicle_plate: request.vehicle_plate,
    vehicle_type: request.vehicle_type,
    submittedAt: formatDateTime(request.submitted_at, tz),
    lateChange: !!request.late_change_at,
    timesNeedFix: request.times_need_fix,
  };
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
        setupWindows: settings.setup_windows,
        teardownWindows: settings.teardown_windows,
        slotStep: settings.slot_step_minutes,
        requirePlate: settings.require_vehicle_plate,
      }}
    />
  );
}
