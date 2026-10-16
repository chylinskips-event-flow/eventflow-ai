"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerContext } from "@/lib/partner-portal";
import {
  BOOTH_LOAD_ERROR,
  ensureDefaultCatalog,
  getBoothRequest,
  getCatalog,
  getLogisticsSettings,
  getOrganizerEmail,
  loadBoothData,
} from "@/lib/booth-requests";
import {
  VEHICLE_TYPES,
  hasPlanChanges,
  isAfterDeadline,
  normalizePlate,
  parseRequestItems,
  planRequestItems,
  slotFits,
  validateRequestInfo,
  windowsLabel,
  type BoothRequestInfo,
  type LogisticsSettings,
  type TimeWindow,
} from "@/lib/booth-requests-core";
import { sendBoothRequestSubmittedEmail } from "@/lib/email/booth-request";
import { getOrigin } from "@/lib/request-origin";
import { parseDateTimeLocal } from "@/lib/format";
import type { PartnerActionState } from "./actions";

// #10 Faza A2 — wniosek partnera o zapotrzebowanie na stoisko. Autoryzacja jak w Fazie A:
// getPartnerContext przy każdym wywołaniu (aktywny dostęp do TEGO partnera, event dostępny,
// plan z partner_portal). Zapis zawsze w zakresie ctx.partner.id / ctx.event.id.

const NO_ACCESS = "Brak dostępu — zaloguj się ponownie albo poproś organizatora o zaproszenie.";
/**
 * Godziny etapu (montaż/demontaż). Z oknami organizatora: dzień + godziny z listy, sprawdzane
 * slotFits (wybór spoza okna odrzucany). Bez okien: tylko orientacyjny opis tekstowy.
 */
function readTimes(
  formData: FormData,
  kind: "setup" | "teardown",
  label: string,
  windows: TimeWindow[],
  step: number,
  timezone: string | null,
): { start: string | null; end: string | null; note: string | null } | string {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  if (windows.length === 0) return { start: null, end: null, note: str(`${kind}_note`) || null };
  const slot = { date: str(`${kind}_date`), from: str(`${kind}_from`), to: str(`${kind}_to`) };
  if (!slot.date && !slot.from && !slot.to) return { start: null, end: null, note: null };
  if (!slot.date || !slot.from || !slot.to) return `${label}: wybierz dzień oraz godzinę rozpoczęcia i zakończenia.`;
  if (!slotFits(slot, windows, step)) {
    return `${label}: wybrany przedział jest poza godzinami ustalonymi przez organizatora (${windowsLabel(windows)}).`;
  }
  return {
    start: parseDateTimeLocal(`${slot.date}T${slot.from}`, timezone),
    end: parseDateTimeLocal(`${slot.date}T${slot.to}`, timezone),
    note: null,
  };
}

function readInfo(formData: FormData, settings: LogisticsSettings, timezone: string | null): BoothRequestInfo | string {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const crewRaw = str("crew_count");
  if (crewRaw && !/^\d+$/.test(crewRaw)) return "Liczba osób obsługi: liczba całkowita.";
  const step = settings.slot_step_minutes;
  const setup = readTimes(formData, "setup", "Montaż", settings.setup_windows, step, timezone);
  if (typeof setup === "string") return setup;
  const teardown = readTimes(formData, "teardown", "Demontaż", settings.teardown_windows, step, timezone);
  if (typeof teardown === "string") return teardown;

  const vehicle = formData.get("vehicle") === "on";
  const plate = vehicle ? normalizePlate(str("vehicle_plate")) : null;
  if (plate === "invalid") return "Numer rejestracyjny: litery, cyfry, spacja lub myślnik (do 15 znaków).";
  const typeRaw = str("vehicle_type");
  const vehicleType = vehicle ? (VEHICLE_TYPES.find((t) => t.value === typeRaw)?.value ?? null) : null;
  const note = str("vehicle_note");
  return {
    crew_count: crewRaw ? Number(crewRaw) : null,
    setup_start: setup.start,
    setup_end: setup.end,
    setup_note: setup.note,
    teardown_start: teardown.start,
    teardown_end: teardown.end,
    teardown_note: teardown.note,
    vehicle,
    vehicle_note: vehicle && note ? note : null,
    vehicle_plate: plate,
    vehicle_type: vehicleType,
  };
}

const sameTime = (a: string | null, b: string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

function infoChanged(a: BoothRequestInfo, b: BoothRequestInfo): boolean {
  return (
    a.crew_count !== b.crew_count ||
    a.vehicle !== b.vehicle ||
    (a.vehicle_note ?? null) !== (b.vehicle_note ?? null) ||
    (a.vehicle_plate ?? null) !== (b.vehicle_plate ?? null) ||
    (a.vehicle_type ?? null) !== (b.vehicle_type ?? null) ||
    (a.setup_note ?? null) !== (b.setup_note ?? null) ||
    (a.teardown_note ?? null) !== (b.teardown_note ?? null) ||
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

  const loaded = await loadBoothData(async () => {
    await ensureDefaultCatalog(ctx.event.id);
    return Promise.all([getLogisticsSettings(ctx.event.id), getCatalog(ctx.event.id), getBoothRequest(partnerId)]);
  });
  if (!loaded.ok) return { status: "error", message: BOOTH_LOAD_ERROR };
  const [settings, catalog, existing] = loaded.value;

  const late = isAfterDeadline(settings.request_deadline, Date.now());
  if (late && formData.get("change_request") !== "1") {
    return { status: "error", message: "Termin składania minął — użyj „Poproś o zmianę”." };
  }

  const items = parseRequestItems((k) => formData.get(k), catalog);
  if (!items.ok) return { status: "error", message: items.error };
  const info = readInfo(formData, settings, ctx.event.timezone);
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
  const requestFields = { ...info, times_need_fix: false, submitted_at: now, submitted_by: ctx.user.id, ...(late ? { late_change_at: now } : {}) };
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
        reviewUrl: `${getOrigin(await headers())}/admin/events/${ctx.event.id}/partners/${partnerId}#stoisko`,
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
