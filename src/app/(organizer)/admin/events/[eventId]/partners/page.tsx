import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventPartners, getPartnerStats } from "@/lib/partners";
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

  const [partners, partnerStats] = await Promise.all([
    getEventPartners(eventId),
    getPartnerStats(eventId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Partnerzy</h1>
        <PartnerFormDialog
          eventId={eventId}
          trigger={<Button>Dodaj partnera</Button>}
        />
      </div>

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
              leadCount={partnerStats[partner.id]?.leads ?? 0}
            />
          ))}
        </div>
      )}
    </main>
  );
}
