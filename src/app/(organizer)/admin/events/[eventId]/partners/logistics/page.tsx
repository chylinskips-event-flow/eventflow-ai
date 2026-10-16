import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { ensureDefaultCatalog, getLogisticsData } from "@/lib/booth-requests";
import { toDateTimeLocalValue } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogCard, LogisticsSettingsCard } from "./logistics-admin";
import { BoothList, TotalsTable } from "./logistics-tables";

export default async function BoothLogisticsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return <FeatureLockedPage title="Logistyka stoisk" message={gate.message} />;

  await ensureDefaultCatalog(eventId);
  const { settings, catalog, booths, totals } = await getLogisticsData(eventId);
  const tz = event.timezone;
  const local = (v: string | null) => toDateTimeLocalValue(v, tz);
  const base = `/admin/events/${eventId}/partners/logistics`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Link
        href={`/admin/events/${eventId}/partners`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Wszyscy partnerzy
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Logistyka stoisk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Partnerzy zgłaszają w swoim panelu, czego potrzebują na stoisku; decyzje podejmujesz w panelu każdego
          partnera. Tu ustawiasz katalog i terminy oraz widzisz, ile łącznie czego zamówić. Numer stoiska ustawiasz
          w edycji partnera.
        </p>
      </div>

      <LogisticsSettingsCard
        eventId={eventId}
        settings={{
          request_deadline: local(settings.request_deadline),
          setup_from: local(settings.setup_from),
          setup_to: local(settings.setup_to),
          teardown_from: local(settings.teardown_from),
          teardown_to: local(settings.teardown_to),
        }}
      />
      <CatalogCard eventId={eventId} catalog={catalog} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Zestawienie</CardTitle>
            <div className="flex flex-wrap gap-1">
              <Button asChild size="sm" variant="outline">
                <a href={`${base}/logistics.csv?view=totals`} download>
                  <Download /> CSV: sumy
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`${base}/logistics.csv?view=booths`} download>
                  <Download /> CSV: stoiska
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href={`${base}/print`} target="_blank" rel="noopener noreferrer">
                  <Printer /> Do druku
                </a>
              </Button>
            </div>
          </div>
          <CardDescription>Suma zatwierdzonych ilości (i oczekujących na decyzję) z rozbiciem na partnerów.</CardDescription>
        </CardHeader>
        <CardContent>
          <TotalsTable totals={totals} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stoiska</CardTitle>
          <CardDescription>Zatwierdzone pozycje, godziny montażu, rozładunek i liczba osób obsługi.</CardDescription>
        </CardHeader>
        <CardContent>
          <BoothList booths={booths} timezone={tz} />
        </CardContent>
      </Card>
    </main>
  );
}
