import { Truck, Users } from "lucide-react";
import type { BoothListRow } from "@/lib/booth-requests";
import { ITEM_STATUS, approvedQty, requestTimesLabel, vehicleLabel, type TotalsRow } from "@/lib/booth-requests-core";
import { partnerTierLabel } from "@/lib/partner-options";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// #10 Faza A2 — tabele widoku zbiorczego; te same na stronie i w wersji do druku.

export function TotalsTable({ totals }: { totals: TotalsRow[] }) {
  if (totals.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak zgłoszonych pozycji.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pozycja</TableHead>
          <TableHead className="text-right">Zatwierdzone</TableHead>
          <TableHead className="text-right">Oczekujące</TableHead>
          <TableHead>Partnerzy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {totals.map((t) => (
          <TableRow key={t.key}>
            <TableCell className="font-medium">
              {t.label} <span className="font-normal text-muted-foreground">({t.unit})</span>
            </TableCell>
            <TableCell className="text-right text-base font-semibold tabular-nums">{t.approved}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{t.pending || "—"}</TableCell>
            <TableCell className="whitespace-normal text-xs text-muted-foreground">
              {t.byPartner
                .map((p) => `${p.partnerName}: ${p.approved}${p.pending ? ` (+${p.pending} oczek.)` : ""}`)
                .join(" · ")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function BoothList({ booths, timezone }: { booths: BoothListRow[]; timezone: string | null }) {
  if (booths.length === 0) {
    return <p className="text-sm text-muted-foreground">Żaden partner nie złożył jeszcze wniosku.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {booths.map((b) => {
        const r = b.request;
        const setup = requestTimesLabel(r.setup_start, r.setup_end, r.setup_note, timezone);
        const teardown = requestTimesLabel(r.teardown_start, r.teardown_end, r.teardown_note, timezone);
        // Zatwierdzone (także „Inne potrzeby”, które nie mają ilości); zatwierdzone 0 szt. pomijamy.
        const approved = r.items.filter(
          (i) => (i.status === "approved" || i.status === "changed") && (!i.catalog_item_id || approvedQty(i) > 0),
        );
        const waiting = r.items.filter((i) => i.status === "pending");
        return (
          <li key={b.partnerId} className="break-inside-avoid rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{b.partnerName}</span>
              {b.tier && <Badge variant="secondary">{partnerTierLabel(b.tier)}</Badge>}
              <span className="text-muted-foreground">Stoisko: {b.boothLocation ?? "—"}</span>
              {r.times_need_fix && <Badge variant="warning">Godziny do poprawy</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> Obsługa: {r.crew_count ?? "—"}
              </span>
              <span>Montaż: {setup ?? "—"}</span>
              <span>Demontaż: {teardown ?? "—"}</span>
              <span className="inline-flex items-center gap-1">
                <Truck className="size-3.5" /> Rozładunek: {vehicleLabel(r).toLowerCase()}
              </span>
            </div>
            {approved.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-0.5">
                {approved.map((i) => (
                  <li key={i.id}>
                    {i.catalog_item_id ? (
                      <>
                        <span className="tabular-nums font-medium">{approvedQty(i)}</span> {i.unit} · {i.label}
                      </>
                    ) : (
                      <>{i.label}:</>
                    )}
                    {i.note && <span className="text-muted-foreground"> — {i.note}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Brak zatwierdzonych pozycji.</p>
            )}
            {waiting.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {ITEM_STATUS.pending.label}: {waiting.map((i) => (i.catalog_item_id ? `${i.label} (${i.qty})` : i.label)).join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
