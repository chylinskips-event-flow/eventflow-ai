import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getLogisticsData, loadBoothData } from "@/lib/booth-requests";
import { BOOTH_ERROR_HINT_ORGANIZER, BoothLoadError } from "@/components/booth-load-error";
import { formatDateTime, getCurrentTimestamp } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Button } from "@/components/ui/button";
import { PrintButton } from "../../[partnerId]/booth-qr/print-button";
import { BoothList, TotalsTable } from "../logistics-tables";

// Widok do druku dla ekipy technicznej — sidebar i nagłówek panelu ukryte na wydruku (layout).
export default async function BoothLogisticsPrintPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return <FeatureLockedPage title="Logistyka stoisk" message={gate.message} />;

  const data = await loadBoothData(() => getLogisticsData(eventId));
  if (!data.ok) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <BoothLoadError title="Nie udało się wczytać logistyki stoisk" hint={BOOTH_ERROR_HINT_ORGANIZER} />
      </main>
    );
  }
  const { booths, totals } = data.value;
  const printedAt = formatDateTime(new Date(getCurrentTimestamp()).toISOString(), event.timezone);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 print:max-w-none print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/admin/events/${eventId}/partners/logistics`}>
            <ArrowLeft className="size-4" /> Powrót
          </Link>
        </Button>
        <PrintButton />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Logistyka stoisk — {event.name}</h1>
        <p className="text-sm text-muted-foreground">Stan na {printedAt}. Ilości: zatwierdzone przez organizatora.</p>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Zestawienie</h2>
        <TotalsTable totals={totals} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Stoiska</h2>
        <BoothList booths={booths} timezone={event.timezone} />
      </section>
    </main>
  );
}
