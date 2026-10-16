"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import { BOOTH_LOAD_ERROR, getBoothRequest, getCatalog, getPartnerRecipientEmails, loadBoothData } from "@/lib/booth-requests";
import { DECISION_NOTE_MAX_LENGTH, inPackagePendingIds, parseApprovedQty } from "@/lib/booth-requests-core";
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
 * Gdy po decyzji nie zostało nic do akceptacji: zdejmujemy oznaczenie „Zmiana po terminie”
 * (zmiana rozpatrzona) i wysyłamy jeden zbiorczy mail do osób z dostępem do panelu partnera.
 * Błąd wysyłki nie cofa decyzji (jak w zaproszeniach).
 */
async function notifyIfReviewed(
  ctx: { event: { name: string }; partner: { id: string; name: string } },
): Promise<string | null> {
  const request = await getBoothRequest(ctx.partner.id);
  if (!request || request.items.length === 0 || request.items.some((i) => i.status === "pending")) return null;
  if (request.late_change_at) {
    const { error } = await createAdminClient()
      .from("partner_booth_requests")
      .update({ late_change_at: null })
      .eq("id", request.id)
      .eq("partner_id", ctx.partner.id);
    if (error) console.error("[booth-requests] late flag clear failed", JSON.stringify({ code: error.code, message: error.message }));
  }
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

  const admin = createAdminClient();
  let status: "approved" | "changed" | "rejected" = decision === "approve" ? "approved" : "rejected";
  let approvedQty: number | null = null;
  let requestedQty: number | null = null;
  if (decision === "change") {
    const { data: current } = await admin
      .from("partner_booth_request_items")
      .select("qty")
      .eq("id", itemId)
      .eq("partner_id", partnerId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!current) return { status: "error", message: "Pozycja nie istnieje — odśwież stronę." };
    requestedQty = current.qty as number;
    const parsed = parseApprovedQty(formData.get("approved_qty"), requestedQty);
    if (!parsed.ok) return { status: "error", message: parsed.error };
    // Ilość równa wnioskowanej to zwykłe zatwierdzenie, nie „inna ilość”.
    if (parsed.value === requestedQty) status = "approved";
    else {
      status = "changed";
      approvedQty = parsed.value;
    }
  }

  let update = admin
    .from("partner_booth_request_items")
    .update({ status, approved_qty: approvedQty, decision_note: note || null, reviewed_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("partner_id", partnerId)
    .eq("event_id", eventId);
  // Partner mógł w międzyczasie zmienić ilość — decyzja dotyczy tej, którą widział organizator.
  if (requestedQty !== null) update = update.eq("qty", requestedQty);
  const { data, error } = await update.select("id");
  if (error) return { status: "error", message: "Nie udało się zapisać decyzji." };
  if (!data?.length) return { status: "error", message: "Pozycja zmieniła się w międzyczasie — odśwież stronę." };

  revalidate(eventId, partnerId);
  // Odczyt po zapisie decyzji nie może jej „cofnąć” w UI — błąd = brak maila.
  const mail = await notifyIfReviewed(ctx).catch(() => " E-mail do partnera nie został wysłany.");
  return { status: "success", message: `Decyzja zapisana.${mail ?? ""}` };
}

/** „Zatwierdź wszystko w pakiecie” — oczekujące pozycje mieszczące się w limicie poziomu. */
export async function approveBoothItemsInPackage(eventId: string, partnerId: string): Promise<BoothDecisionState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const loaded = await loadBoothData(() => Promise.all([getBoothRequest(partnerId), getCatalog(eventId)]));
  if (!loaded.ok) return { status: "error", message: BOOTH_LOAD_ERROR };
  const [request, catalog] = loaded.value;
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
  // Odczyt po zapisie decyzji nie może jej „cofnąć” w UI — błąd = brak maila.
  const mail = await notifyIfReviewed(ctx).catch(() => " E-mail do partnera nie został wysłany.");
  return { status: "success", message: `Zatwierdzono ${ids.length} poz.${mail ?? ""}` };
}
