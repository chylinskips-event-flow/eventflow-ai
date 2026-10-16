"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import { getBoothRequest, getCatalog, getPartnerRecipientEmails } from "@/lib/booth-requests";
import { DECISION_NOTE_MAX_LENGTH, ITEM_QTY_MAX, inPackagePendingIds } from "@/lib/booth-requests-core";
import { sendBoothDecisionEmail } from "@/lib/email/booth-request";

// #10 Faza A2 — decyzje organizatora w sprawie zapotrzebowania partnera na stoisko.

export type BoothDecisionState = { status: "idle" | "success" | "error"; message?: string };

export type BoothDecision = "approve" | "change" | "reject";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function organizerContext(eventId: string, partnerId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) return { error: "Brak dostępu do wydarzenia." } as const;
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return { error: gate.message } as const;
  if (!UUID.test(partnerId)) return { error: "Partner nie istnieje." } as const;
  const { data: partner } = await createAdminClient()
    .from("partners")
    .select("id, name, tier")
    .eq("id", partnerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!partner) return { error: "Partner nie istnieje." } as const;
  return { event, partner: partner as { id: string; name: string; tier: string | null } } as const;
}

function revalidate(eventId: string, partnerId: string) {
  revalidatePath(`/admin/events/${eventId}/partners`);
  revalidatePath(`/admin/events/${eventId}/partners/${partnerId}`);
  revalidatePath(`/admin/events/${eventId}/partners/logistics`);
  revalidatePath(`/partner/${partnerId}`);
}

/**
 * Gdy po decyzji nie zostało nic do akceptacji — jeden zbiorczy mail do osób z dostępem
 * do panelu partnera. Błąd wysyłki nie cofa decyzji (jak w zaproszeniach).
 */
async function notifyIfReviewed(
  ctx: { event: { name: string }; partner: { id: string; name: string } },
): Promise<string | null> {
  const request = await getBoothRequest(ctx.partner.id);
  if (!request || request.items.length === 0 || request.items.some((i) => i.status === "pending")) return null;
  const recipients = await getPartnerRecipientEmails(ctx.partner.id);
  if (recipients.length === 0) return null;
  const panelUrl = `${getOrigin(await headers())}/partner/${ctx.partner.id}`;
  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendBoothDecisionEmail({ to, partnerName: ctx.partner.name, eventName: ctx.event.name, items: request.items, panelUrl }),
    ),
  );
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.error("[booth-requests] decision email failed", (f as PromiseRejectedResult).reason);
  return failed.length === results.length ? " E-mail do partnera nie został wysłany." : " Partner dostał e-mail z decyzjami.";
}

export async function decideBoothItem(
  eventId: string,
  partnerId: string,
  itemId: string,
  decision: BoothDecision,
  _prev: BoothDecisionState,
  formData: FormData,
): Promise<BoothDecisionState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(itemId) || !["approve", "change", "reject"].includes(decision)) {
    return { status: "error", message: "Pozycja nie istnieje." };
  }

  const rawNote = formData.get("decision_note");
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > DECISION_NOTE_MAX_LENGTH) {
    return { status: "error", message: `Uwaga może mieć najwyżej ${DECISION_NOTE_MAX_LENGTH} znaków.` };
  }

  let approvedQty: number | null = null;
  if (decision === "change") {
    const raw = formData.get("approved_qty");
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!/^\d+$/.test(value) || Number(value) > ITEM_QTY_MAX) {
      return { status: "error", message: `Podaj zatwierdzoną ilość (0–${ITEM_QTY_MAX}).` };
    }
    approvedQty = Number(value);
  }

  const status = decision === "approve" ? "approved" : decision === "change" ? "changed" : "rejected";
  const { data, error } = await createAdminClient()
    .from("partner_booth_request_items")
    .update({ status, approved_qty: approvedQty, decision_note: note || null, reviewed_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("partner_id", partnerId)
    .eq("event_id", eventId)
    .select("id");
  if (error) return { status: "error", message: "Nie udało się zapisać decyzji." };
  if (!data?.length) return { status: "error", message: "Pozycja nie istnieje — odśwież stronę." };

  revalidate(eventId, partnerId);
  const mail = await notifyIfReviewed(ctx);
  return { status: "success", message: `Decyzja zapisana.${mail ?? ""}` };
}

/** „Zatwierdź wszystko w pakiecie” — oczekujące pozycje mieszczące się w limicie poziomu. */
export async function approveBoothItemsInPackage(eventId: string, partnerId: string): Promise<BoothDecisionState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const [request, catalog] = await Promise.all([getBoothRequest(partnerId), getCatalog(eventId)]);
  const ids = request ? inPackagePendingIds(request.items, catalog, ctx.partner.tier) : [];
  if (ids.length === 0) return { status: "error", message: "Brak oczekujących pozycji w pakiecie." };

  const { error } = await createAdminClient()
    .from("partner_booth_request_items")
    .update({ status: "approved", approved_qty: null, reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("partner_id", partnerId)
    .eq("status", "pending");
  if (error) return { status: "error", message: "Nie udało się zatwierdzić pozycji." };

  revalidate(eventId, partnerId);
  const mail = await notifyIfReviewed(ctx);
  return { status: "success", message: `Zatwierdzono ${ids.length} poz.${mail ?? ""}` };
}
