import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { getEventPartners, getPartnerStats } from "@/lib/partners";
import { getPendingReviewCounts, getPortalAccessSummary } from "@/lib/partner-portal";
import { getActiveLeadCounts, getPendingQuestionCounts, isPartnerLeadsEnabled } from "@/lib/partner-leads";
import { getBoothRequestStatuses, loadBoothData } from "@/lib/booth-requests";
import { BOOTH_ERROR_HINT_ORGANIZER, BoothLoadError } from "@/components/booth-load-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PartnerFormDialog } from "./partner-form-dialog";
import { PartnerCard } from "./partner-card";

export default async function EventPartnersPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  const leadsV2 = isPartnerLeadsEnabled();
  const empty = Promise.resolve({} as Record<string, number>);
  const [partners, partnerStats, pendingReviews, portalAccess, boothStatuses, pendingQuestions, activeLeads] = await Promise.all([
    getEventPartners(eventId),
    getPartnerStats(eventId),
    getPendingReviewCounts(eventId),
    getPortalAccessSummary(eventId),
    loadBoothData(() => getBoothRequestStatuses(eventId)),
    leadsV2 ? getPendingQuestionCounts(eventId) : empty,
    leadsV2 ? getActiveLeadCounts(eventId) : empty,
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">Partnerzy</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/events/${eventId}/partners/logistics`}>
              <Truck /> Logistyka stoisk
            </Link>
          </Button>
          <PartnerFormDialog
            eventId={eventId}
            trigger={<Button>Dodaj partnera</Button>}
          />
        </div>
      </div>

      {!boothStatuses.ok && (
        <BoothLoadError title="Nie udało się wczytać wniosków o zapotrzebowanie na stoisko" hint={BOOTH_ERROR_HINT_ORGANIZER} />
      )}

      {partners.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych partnerów.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {partners.map((partner) => (
            <PartnerCard
              key={partner.id}
              eventId={eventId}
              partner={partner}
              checkinCount={partnerStats[partner.id]?.checkins ?? 0}
              // Faza B: leady = aktywne zgody z karty „Pytania od {partner}”. Zgody ze starego
              // checkboxa przy check-inie zostają jako archiwum (osobny eksport).
              leadCount={leadsV2 ? (activeLeads[partner.id] ?? 0) : (partnerStats[partner.id]?.leads ?? 0)}
              legacyLeadCount={leadsV2 ? (partnerStats[partner.id]?.leads ?? 0) : 0}
              leadsV2={leadsV2}
              pendingReviews={(pendingReviews[partner.id] ?? 0) + (pendingQuestions[partner.id] ?? 0)}
              portalAccess={portalAccess[partner.id] ?? "none"}
              boothStatus={boothStatuses.ok ? (boothStatuses.value[partner.id] ?? { kind: "none" }) : null}
            />
          ))}
        </div>
      )}
    </main>
  );
}
