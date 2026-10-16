"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerContext } from "@/lib/partner-portal";
import { ensureDefaultCatalog, getBoothRequest, getCatalog, getLogisticsSettings, getOrganizerEmail } from "@/lib/booth-requests";
import {
  hasPlanChanges,
  isAfterDeadline,
  parseRequestItems,
  planRequestItems,
  validateRequestInfo,
  type BoothRequestInfo,
} from "@/lib/booth-requests-core";
import { sendBoothRequestSubmittedEmail } from "@/lib/email/booth-request";
import { getOrigin } from "@/lib/request-origin";
import { parseDateTimeLocal } from "@/lib/format";
import type { PartnerActionState } from "./actions";

// #10 Faza A2 — wniosek partnera o zapotrzebowanie na stoisko. Autoryzacja jak w Fazie A:
// getPartnerContext przy każdym wywołaniu (aktywny dostęp do TEGO partnera, event dostępny,
// plan z partner_portal). Zapis zawsze w zakresie ctx.partner.id / ctx.event.id.

const NO_ACCESS = "Brak dostępu — zaloguj się ponownie albo poproś organizatora o zaproszenie.";
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function readInfo(formData: FormData, timezone: string | null): BoothRequestInfo | string {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const when = (k: string) => {
    const v = str(k);
    if (!v) return null;
    return DATETIME.test(v) ? parseDateTimeLocal(v, timezone) : "invalid";
  };
  const crewRaw = str("crew_count");
  if (crewRaw && !/^\d+$/.test(crewRaw)) return "Liczba osób obsługi: liczba całkowita.";
  const times = {
    setup_start: when("setup_start"),
    setup_end: when("setup_end"),
    teardown_start: when("teardown_start"),
    teardown_end: when("teardown_end"),
  };
  if (Object.values(times).includes("invalid")) return "Niepoprawna data lub godzina.";
  const vehicle = formData.get("vehicle") === "on";
  const note = str("vehicle_note");
  return {
    crew_count: crewRaw ? Number(crewRaw) : null,
    ...times,
    vehicle,
    vehicle_note: vehicle && note ? note : null,
  };
}

const sameTime = (a: string | null, b: string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

function infoChanged(a: BoothRequestInfo, b: BoothRequestInfo): boolean {
  return (
    a.crew_count !== b.crew_count ||
    a.vehicle !== b.vehicle ||
    (a.vehicle_note ?? null) !== (b.vehicle_note ?? null) ||
    !sameTime(a.setup_start, b.setup_start) ||
    !sameTime(a.setup_end, b.setup_end) ||
    !sameTime(a.teardown_start, b.teardown_start) ||
    !sameTime(a.teardown_end, b.teardown_end)
  );
}

/**
 * „Wyślij do akceptacji”. Zmienione pozycje wracają do akceptacji, niezmienione zachowują
 * decyzję. Po terminie tylko z flagą change_request („Poproś o zmianę”) — zapis oznaczany
 * jako zmiana po terminie.
 */
export async function submitBoothRequest(
  partnerId: string,
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };

  await ensureDefaultCatalog(ctx.event.id);
  const [settings, catalog, existing] = await Promise.all([
    getLogisticsSettings(ctx.event.id),
    getCatalog(ctx.event.id),
    getBoothRequest(partnerId),
  ]);

  const late = isAfterDeadline(settings.request_deadline, Date.now());
  if (late && formData.get("change_request") !== "1") {
    return { status: "error", message: "Termin składania minął — użyj „Poproś o zmianę”." };
  }

  const items = parseRequestItems((k) => formData.get(k), catalog);
  if (!items.ok) return { status: "error", message: items.error };
  const info = readInfo(formData, ctx.event.timezone);
  if (typeof info === "string") return { status: "error", message: info };
  const infoError = validateRequestInfo(info, settings);
  if (infoError) return { status: "error", message: infoError };
  if (!existing && items.value.length === 0) {
    return { status: "error", message: "Wpisz ilość przy co najmniej jednej pozycji albo opisz inne potrzeby." };
  }

  const locked = new Set(catalog.filter((c) => !c.active).map((c) => c.id));
  const plan = planRequestItems(existing?.items ?? [], items.value, locked);
  const changedInfo = !existing || infoChanged(existing, info);
  if (existing && !hasPlanChanges(plan) && !changedInfo) {
    return { status: "success", message: "Brak zmian — wniosek jest aktualny." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  let requestId = existing?.id;
  const requestFields = { ...info, submitted_at: now, submitted_by: ctx.user.id, ...(late ? { late_change_at: now } : {}) };
  if (requestId) {
    const { error } = await admin
      .from("partner_booth_requests")
      .update(requestFields)
      .eq("id", requestId)
      .eq("partner_id", partnerId);
    if (error) return { status: "error", message: "Nie udało się zapisać wniosku." };
  } else {
    const { data, error } = await admin
      .from("partner_booth_requests")
      .insert({ ...requestFields, partner_id: partnerId, event_id: ctx.event.id })
      .select("id")
      .single();
    if (error || !data) return { status: "error", message: "Nie udało się zapisać wniosku. Odśwież stronę i spróbuj ponownie." };
    requestId = data.id as string;
  }

  const reset = { status: "pending", approved_qty: null, decision_note: null, reviewed_at: null };
  const ops = [
    plan.inserts.length
      ? admin.from("partner_booth_request_items").insert(
          plan.inserts.map((i) => ({ ...i, request_id: requestId, partner_id: partnerId, event_id: ctx.event.id })),
        )
      : null,
    ...plan.updates.map(({ id, ...i }) =>
      admin
        .from("partner_booth_request_items")
        .update({ label: i.label, unit: i.unit, qty: i.qty, note: i.note, ...reset })
        .eq("id", id)
        .eq("request_id", requestId),
    ),
    plan.deletes.length
      ? admin.from("partner_booth_request_items").delete().in("id", plan.deletes).eq("request_id", requestId)
      : null,
  ].filter((op) => op !== null);
  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[booth-requests] items save failed", JSON.stringify({ code: failed.error.code, message: failed.error.message }));
    return { status: "error", message: "Nie udało się zapisać wszystkich pozycji. Odśwież stronę i sprawdź wniosek." };
  }

  revalidatePath(`/partner/${partnerId}`);
  revalidatePath(`/admin/events/${ctx.event.id}/partners`);
  revalidatePath(`/admin/events/${ctx.event.id}/partners/${partnerId}`);
  revalidatePath(`/admin/events/${ctx.event.id}/partners/logistics`);

  // Powiadomienie organizatora — błąd wysyłki nie cofa zapisu.
  try {
    const to = await getOrganizerEmail(ctx.event.organization_id);
    const saved = await getBoothRequest(partnerId);
    if (to && saved) {
      await sendBoothRequestSubmittedEmail({
        to,
        partnerName: ctx.partner.name,
        eventName: ctx.event.name,
        pendingItems: saved.items.filter((i) => i.status === "pending"),
        lateChange: late,
        reviewUrl: `${getOrigin(await headers())}/admin/events/${ctx.event.id}/partners/${partnerId}`,
      });
    }
  } catch (e) {
    console.error("[booth-requests] organizer email failed", e instanceof Error ? e.message : e);
  }

  const pending = plan.inserts.length + plan.updates.length;
  return {
    status: "success",
    message: pending > 0 ? "Wniosek wysłany do akceptacji organizatora." : "Wniosek zaktualizowany.",
  };
}
