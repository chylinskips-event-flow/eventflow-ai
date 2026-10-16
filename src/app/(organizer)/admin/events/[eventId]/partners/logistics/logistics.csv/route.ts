import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getLogisticsData, loadBoothData } from "@/lib/booth-requests";
import { ITEM_STATUS, approvedQty, requestTimesLabel, vehicleTypeLabel } from "@/lib/booth-requests-core";
import { partnerTierLabel } from "@/lib/partner-options";
import { toExcelCsv } from "@/lib/csv";

// #10 Faza A2 — eksport logistyki stoisk dla ekipy technicznej.
// ?view=totals (domyślnie): pozycja × suma, jak tabela zbiorcza; ?view=booths: pozycje per stoisko.
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) return new Response("Not found", { status: 404 });
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return new Response("Forbidden", { status: 403 });

  const view = new URL(req.url).searchParams.get("view") === "booths" ? "booths" : "totals";
  const data = await loadBoothData(() => getLogisticsData(eventId));
  if (!data.ok) {
    return new Response("Nie udało się wczytać logistyki stoisk — sprawdź migracje bazy.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const { booths, totals } = data.value;
  const tz = event.timezone;

  const csv =
    view === "totals"
      ? toExcelCsv(
          ["Pozycja", "Jednostka", "Zatwierdzone", "Oczekujące", "Rozbicie na partnerów (zatwierdzone)"],
          totals.map((t) => [
            t.label,
            t.unit,
            t.approved,
            t.pending,
            t.byPartner
              .filter((p) => p.approved > 0)
              .map((p) => `${p.partnerName}: ${p.approved}`)
              .join(" | "),
          ]),
        )
      : toExcelCsv(
          [
            "Partner",
            "Poziom",
            "Stoisko",
            "Pozycja",
            "Jednostka",
            "Zgłoszono",
            "Zatwierdzono",
            "Status",
            "Uwaga partnera",
            "Uwaga organizatora",
            "Osoby obsługi",
            "Montaż",
            "Demontaż",
            "Rozładunek",
            "Typ pojazdu",
            "Nr rejestracyjny",
            "Uwaga o rozładunku",
            "Godziny do poprawy",
          ],
          booths.flatMap((b) => {
            const r = b.request;
            const shared = [
              r.crew_count !== null ? String(r.crew_count) : "",
              requestTimesLabel(r.setup_start, r.setup_end, r.setup_note, tz) ?? "",
              requestTimesLabel(r.teardown_start, r.teardown_end, r.teardown_note, tz) ?? "",
              r.vehicle ? "Tak" : "Nie",
              r.vehicle ? (vehicleTypeLabel(r.vehicle_type) ?? "") : "",
              r.vehicle ? (r.vehicle_plate ?? "") : "",
              r.vehicle ? (r.vehicle_note ?? "") : "",
              r.times_need_fix ? "Tak" : "",
            ];
            const head = [b.partnerName, partnerTierLabel(b.tier) ?? "", b.boothLocation ?? ""];
            if (r.items.length === 0) return [[...head, "", "", "", "", "", "", "", ...shared]];
            return r.items.map((i) => [
              ...head,
              i.label,
              i.catalog_item_id ? i.unit : "",
              i.catalog_item_id ? i.qty : "",
              i.catalog_item_id ? approvedQty(i) : "",
              ITEM_STATUS[i.status].label,
              i.note ?? "",
              i.decision_note ?? "",
              ...shared,
            ]);
          }),
        );

  const safeName = event.slug.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="logistyka-${view === "totals" ? "sumy" : "stoiska"}-${safeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
