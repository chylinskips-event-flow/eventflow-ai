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
import {
  ensureDefaultCatalog,
  getBoothRequest,
  getCatalog,
  getLogisticsSettings,
  loadBoothData,
} from "@/lib/booth-requests";
import { includedFor, isAfterDeadline, toLocalSlot } from "@/lib/booth-requests-core";
import type { BoothRequestView } from "./booth-request-card";
import { computeTabs, resolveTab, type PanelState } from "@/lib/partner-panel-tabs";
import { PartnerPanel } from "./partner-panel";

export default async function PartnerPanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ partnerId }, { tab }] = await Promise.all([params, searchParams]);
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) {
    if (!(await getAuthUser())) redirect("/partner/login");
    // /partner rozstrzyga: inny panel, „dostęp cofnięty” albo brak dostępu.
    redirect("/partner");
  }

  const [draft, materials, contact, , boothData] = await Promise.all([
    getProfileDraft(partnerId),
    getPartnerMaterials(partnerId),
    getPartnerContact(partnerId),
    touchPartnerAccess(ctx.accessId),
    // Błąd odczytu logistyki (np. brak migracji) → komunikat w karcie, reszta panelu działa.
    loadBoothData(async () => {
      await ensureDefaultCatalog(ctx.event.id);
      return Promise.all([getLogisticsSettings(ctx.event.id), getCatalog(ctx.event.id), getBoothRequest(partnerId)]);
    }),
  ]);
  const tz = ctx.event.timezone;
  const isPublic = ctx.event.status === "published" || ctx.event.status === "live";
  const origin = getOrigin(await headers());

  let booth: React.ComponentProps<typeof PartnerPanel>["booth"] = null;
  if (boothData.ok) {
    const [settings, catalog, request] = boothData.value;
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
      lateChange: !!request.late_change_at && request.items.some((i) => i.status === "pending"),
      timesNeedFix: request.times_need_fix,
    };
    booth = {
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
    };
  }

  const published = publishedProfile(ctx.partner);
  const panelState: PanelState = {
    profile: {
      draftStatus: draft?.status ?? null,
      hasLogo: !!published.logo_url,
      hasDescription: !!published.description?.trim(),
    },
    materials: materials.map((m) => m.status),
    booth: booth
      ? {
          loadError: false,
          hasRequest: !!booth.request,
          pendingItems: booth.request?.items.filter((i) => i.status === "pending").length ?? 0,
          timesNeedFix: booth.request?.timesNeedFix ?? false,
          locked: booth.locked,
          deadlineLabel: booth.deadlineLabel,
        }
      : { loadError: true, hasRequest: false, pendingItems: 0, timesNeedFix: false, locked: false, deadlineLabel: null },
    // Faza B (pytania i kontakty ze stoiska) dołoży tu swoją flagę i treść zakładki „Leady”.
    leadsEnabled: false,
    contact: { hasContact: !!(contact?.contact_name?.trim() || contact?.contact_email?.trim() || contact?.contact_phone?.trim()) },
  };
  const tabs = computeTabs(panelState);

  return (
    <PartnerPanel
      partnerId={partnerId}
      userEmail={ctx.user.email}
      eventName={ctx.event.name}
      eventDate={formatDate(ctx.event.starts_at, ctx.event.timezone)}
      tier={partnerTierLabel(ctx.partner.tier)}
      boothLocation={ctx.partner.booth_location}
      published={published}
      draft={draft}
      materials={materials}
      contact={contact}
      publicUrl={isPublic ? `${origin}/e/${ctx.event.slug}/partners/${partnerId}` : null}
      booth={booth}
      panelState={panelState}
      tabs={tabs}
      initialTab={resolveTab(tab, tabs)}
    />
  );
}
