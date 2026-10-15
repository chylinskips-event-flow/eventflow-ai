import Papa from "papaparse";
import { getPartnerContext } from "@/lib/partner-portal";
import { getPartnerLeads, isPartnerLeadsEnabled, logLeadAudit } from "@/lib/partner-leads";
import { csvSafe, leadsToCsvRows } from "@/lib/partner-leads-core";

// #10 Faza B — eksport leadów partnera (aktywne zgody + odpowiedzi). Bez wpisu w audycie
// eksport się nie odbywa.
export async function GET(_req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  if (!isPartnerLeadsEnabled()) return new Response("Not found", { status: 404 });
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const leads = await getPartnerLeads(partnerId);
  const logged = await logLeadAudit({
    eventId: ctx.event.id,
    partnerId,
    actorType: "partner",
    actorUserId: ctx.user.id,
    action: "leads_exported",
    metadata: { count: leads.length },
  });
  if (!logged) return new Response("Export unavailable", { status: 503 });

  const { columns, rows } = leadsToCsvRows(leads);
  const csv = Papa.unparse({
    fields: columns.map(csvSafe),
    data: rows.map((r) => columns.map((c) => csvSafe(r[c] ?? ""))),
  });
  const safeName = ctx.partner.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leady-${safeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
