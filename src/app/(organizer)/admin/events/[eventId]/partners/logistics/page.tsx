import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { ensureDefaultCatalog, getLogisticsData, loadBoothData } from "@/lib/booth-requests";
import { BOOTH_ERROR_HINT_ORGANIZER, BoothLoadError } from "@/components/booth-load-error";
import { toDateTimeLocalValue } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { TabbedSections } from "@/components/tabbed-sections";
import { resolveTabKey } from "@/lib/url-tabs";
import { LOGISTICS_DEFAULT_TAB, LOGISTICS_TABS, LOGISTICS_TAB_KEYS } from "@/lib/organizer-tabs";
import { CatalogCard, LogisticsSettingsCard } from "./logistics-admin";
import { BoothList, TotalsTable } from "./logistics-tables";

export default async function BoothLogisticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId }, { tab }] = await Promise.all([params, searchParams]);
  const back = { href: `/admin/events/${eventId}/partners`, label: "Wszyscy partnerzy" };
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return <FeatureLockedPage title="Logistyka stoisk" message={gate.message} />;

  const data = await loadBoothData(async () => {
    await ensureDefaultCatalog(eventId);
    return getLogisticsData(eventId);
  });
  if (!data.ok) {
    return (
      <PageShell back={back} title="Logistyka stoisk">
        <BoothLoadError title="Nie udało się wczytać logistyki stoisk" hint={BOOTH_ERROR_HINT_ORGANIZER} />
      </PageShell>
    );
  }
  const { settings, catalog, booths, totals } = data.value;
  const tz = event.timezone;
  const base = `/admin/events/${eventId}/partners/logistics`;

  const settingsPanel = (
    <>
      <LogisticsSettingsCard
        eventId={eventId}
        settings={{
          request_deadline: toDateTimeLocalValue(settings.request_deadline, tz),
          setup_windows: settings.setup_windows,
          teardown_windows: settings.teardown_windows,
          slot_step_minutes: settings.slot_step_minutes,
          require_vehicle_plate: settings.require_vehicle_plate,
        }}
      />
      <CatalogCard eventId={eventId} catalog={catalog} />
    </>
  );

  const totalsPanel = (
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
  );

  const boothsPanel = (
    <Card>
      <CardHeader>
        <CardTitle>Stoiska</CardTitle>
        <CardDescription>Zatwierdzone pozycje, godziny montażu, rozładunek i liczba osób obsługi.</CardDescription>
      </CardHeader>
      <CardContent>
        <BoothList booths={booths} timezone={tz} />
      </CardContent>
    </Card>
  );

  return (
    <PageShell
      back={back}
      title="Logistyka stoisk"
      description={
        <>
          Partnerzy zgłaszają w swoim panelu, czego potrzebują na stoisku; decyzje podejmujesz w panelu każdego
          partnera. Tu ustawiasz katalog i terminy oraz widzisz, ile łącznie czego zamówić. Numer stoiska ustawiasz
          w edycji partnera.
        </>
      }
    >
      <TabbedSections
        tabs={[...LOGISTICS_TABS]}
        initialTab={resolveTabKey(tab, LOGISTICS_TAB_KEYS, LOGISTICS_DEFAULT_TAB)}
        defaultTab={LOGISTICS_DEFAULT_TAB}
        idPrefix="logistics"
        ariaLabel="Sekcje logistyki stoisk"
        panels={{ zestawienie: totalsPanel, stoiska: boothsPanel, ustawienia: settingsPanel }}
      />
    </PageShell>
  );
}
