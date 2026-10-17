import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getPartnerById } from "@/lib/partners";
import {
  getPartnerAccessList,
  getPartnerContact,
  getPartnerMaterials,
  getProfileDraft,
  publishedProfile,
} from "@/lib/partner-portal";
import { accessStatus, changedProfileFields } from "@/lib/partner-portal-core";
import { partnerTierLabel } from "@/lib/partner-options";
import { getOrigin } from "@/lib/request-origin";
import { formatDateTime, getCurrentTimestamp } from "@/lib/format";
import { getBoothRequest, getCatalog, loadBoothData } from "@/lib/booth-requests";
import { BOOTH_ERROR_HINT_ORGANIZER, BOOTH_ERROR_TITLE, BoothLoadError } from "@/components/booth-load-error";
import { inPackagePendingIds, includedFor, isOverPackage, requestTimesLabel, vehicleLabel } from "@/lib/booth-requests-core";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Badge } from "@/components/ui/badge";
import { getLeadAudit, getPartnerLeadCount, getPartnerQuestions, isPartnerLeadsEnabled } from "@/lib/partner-leads";
import { AccessSection, ContactSection, DraftSection, MaterialsSection } from "./partner-portal-admin";
import { PageShell } from "@/components/page-shell";
import { TabbedSections } from "@/components/tabbed-sections";
import { partnerDetailTabs } from "@/lib/organizer-tabs";
import { resolveTabKey } from "@/lib/url-tabs";
import { PartnerLeadsAdmin } from "./partner-leads-admin";
import { BoothRequestAdmin, type AdminBoothRequestView } from "./booth-request-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PartnerPortalAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; partnerId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId, partnerId }, { tab }] = await Promise.all([params, searchParams]);
  const event = await getOwnEvent(eventId);
  if (!event || !UUID.test(partnerId)) notFound();
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return <FeatureLockedPage title="Panel partnera" message={gate.message} />;

  const partner = await getPartnerById(eventId, partnerId);
  if (!partner) notFound();

  const leadsEnabled = isPartnerLeadsEnabled();
  const [access, draft, materials, contact, boothData, questions, leadCount, audit] = await Promise.all([
    getPartnerAccessList(partnerId),
    getProfileDraft(partnerId),
    getPartnerMaterials(partnerId),
    getPartnerContact(partnerId),
    // Błąd odczytu logistyki (np. brak migracji) → widoczny komunikat zamiast „Brak wniosku”.
    loadBoothData(() => Promise.all([getBoothRequest(partnerId), getCatalog(eventId)])),
    leadsEnabled ? getPartnerQuestions(partnerId) : Promise.resolve([]),
    leadsEnabled ? getPartnerLeadCount(partnerId) : Promise.resolve(0),
    leadsEnabled ? getLeadAudit(partnerId) : Promise.resolve([]),
  ]);
  const tz = event.timezone;
  const [boothRequest, catalog] = boothData.ok ? boothData.value : [null, []];
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const boothView: AdminBoothRequestView | null = boothRequest && {
    items: boothRequest.items.map((i) => {
      const c = i.catalog_item_id ? catalogById.get(i.catalog_item_id) : undefined;
      const included = c ? includedFor(c, partner.tier) : null;
      return { ...i, included, over: isOverPackage(i.qty, included) };
    }),
    crewCount: boothRequest.crew_count,
    setup: requestTimesLabel(boothRequest.setup_start, boothRequest.setup_end, boothRequest.setup_note, tz),
    teardown: requestTimesLabel(boothRequest.teardown_start, boothRequest.teardown_end, boothRequest.teardown_note, tz),
    vehicle: boothRequest.vehicle,
    vehicleLabel: vehicleLabel(boothRequest),
    timesNeedFix: boothRequest.times_need_fix,
    submittedAt: formatDateTime(boothRequest.submitted_at, tz),
    // Tylko dopóki zmiana czeka na decyzję (rozpatrzone wnioski sprzed poprawki też bez etykiety).
    lateChange: !!boothRequest.late_change_at && boothRequest.items.some((i) => i.status === "pending"),
  };
  const origin = getOrigin(await headers());
  const now = getCurrentTimestamp();
  const published = publishedProfile(partner);
  const tier = partnerTierLabel(partner.tier);

  const { tabs, defaultTab } = partnerDetailTabs({
    draftPending: draft?.status === "pending",
    pendingMaterials: materials.filter((m) => m.status === "pending").length,
    pendingBoothItems: boothData.ok ? (boothRequest?.items.filter((i) => i.status === "pending").length ?? 0) : null,
    leads: leadsEnabled ? { pendingQuestions: questions.filter((q) => q.status === "pending").length } : null,
  });
  const accessView = access.map((a) => {
    const status = accessStatus(a, now);
    return {
      id: a.id,
      email: a.email,
      status,
      invited_at: a.invited_at,
      last_seen_at: a.last_seen_at,
      inviteUrl: status === "invited" ? `${origin}/partner/invite/${a.invite_token}` : null,
    };
  });

  return (
    <PageShell
      back={{ href: `/admin/events/${eventId}/partners`, label: "Wszyscy partnerzy" }}
      title={partner.name}
      badge={tier && <Badge variant="secondary">{tier}</Badge>}
      description="Panel partnera: dostęp dla osób z firmy partnera, akceptacja ich zmian w wizytówce i materiałach. Poziom partnerstwa ustawiasz Ty (Edytuj na liście partnerów)."
    >
      <TabbedSections
        idPrefix="partner-admin"
        ariaLabel="Sekcje partnera"
        tabs={tabs}
        defaultTab={defaultTab}
        initialTab={resolveTabKey(tab, tabs.map((t) => t.key), defaultTab)}
        panels={{
          wizytowka: (
            <DraftSection
              eventId={eventId}
              partnerId={partnerId}
              published={published}
              draft={draft}
              changed={draft ? changedProfileFields(published, draft) : []}
            />
          ),
          materialy: <MaterialsSection eventId={eventId} partnerId={partnerId} materials={materials} />,
          stoisko: boothData.ok ? (
            <BoothRequestAdmin
              eventId={eventId}
              partnerId={partnerId}
              request={boothView}
              inPackageCount={boothRequest ? inPackagePendingIds(boothRequest.items, catalog, partner.tier).length : 0}
            />
          ) : (
            <BoothLoadError title={BOOTH_ERROR_TITLE} hint={BOOTH_ERROR_HINT_ORGANIZER} />
          ),
          // Faza B — zakładka istnieje tylko przy włączonej funkcji (flaga + bramka prawna).
          leady: leadsEnabled ? (
            <PartnerLeadsAdmin
              eventId={eventId}
              partnerId={partnerId}
              questions={questions}
              leadCount={leadCount}
              audit={audit}
              timezone={event.timezone}
            />
          ) : null,
          kontakt: <ContactSection contact={contact} />,
          dostep: <AccessSection eventId={eventId} partnerId={partnerId} access={accessView} timezone={event.timezone} />,
        }}
      />
    </PageShell>
  );
}
