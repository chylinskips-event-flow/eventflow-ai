"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDateTimeLocal, pluralizePl } from "@/lib/format";
import { getCatalog, getEventBoothRequests, getPartnerRecipientEmails, loadBoothData } from "@/lib/booth-requests";
import {
  MAX_CATALOG_ITEMS,
  SLOT_STEPS,
  parseSlotStep,
  readWindows,
  slotWithinWindows,
  toLocalSlot,
  validateCatalogInput,
  type LogisticsSettings,
} from "@/lib/booth-requests-core";
import { sendBoothTimesNeedFixEmail } from "@/lib/email/booth-request";
import { getOrigin } from "@/lib/request-origin";

// #10 Faza A2 — ustawienia logistyki i katalog pozycji (organizator). Autoryzacja:
// właściciel eventu (getOwnEvent, RLS) + partner_portal w planie.

export type LogisticsState = { status: "idle" | "success" | "error"; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

async function organizerEvent(eventId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) return { error: "Brak dostępu do wydarzenia." } as const;
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return { error: gate.message } as const;
  return { event } as const;
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/partners/logistics`);
  revalidatePath(`/admin/events/${eventId}/partners`, "layout");
}

export async function saveLogisticsSettings(
  eventId: string,
  _prev: LogisticsState,
  formData: FormData,
): Promise<LogisticsState> {
  const ctx = await organizerEvent(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const deadlineRaw = formData.get("request_deadline");
  const deadline = typeof deadlineRaw === "string" ? deadlineRaw.trim() : "";
  if (deadline && !DATETIME.test(deadline)) return { status: "error", message: "Niepoprawny termin składania." };
  const getAll = (k: string) => formData.getAll(k);
  const setup = readWindows(getAll, "setup", "Montaż");
  if (!setup.ok) return { status: "error", message: setup.error };
  const teardown = readWindows(getAll, "teardown", "Demontaż");
  if (!teardown.ok) return { status: "error", message: teardown.error };
  const stepRaw = Number(formData.get("slot_step_minutes"));
  if (!(SLOT_STEPS as readonly number[]).includes(stepRaw)) return { status: "error", message: "Wybierz krok godzin." };

  const settings: LogisticsSettings = {
    request_deadline: deadline ? parseDateTimeLocal(deadline, ctx.event.timezone) : null,
    setup_windows: setup.value,
    teardown_windows: teardown.value,
    slot_step_minutes: parseSlotStep(stepRaw),
    require_vehicle_plate: formData.get("require_vehicle_plate") === "on",
  };

  const { error: dbError } = await createAdminClient()
    .from("booth_logistics_settings")
    .upsert({ event_id: eventId, ...settings }, { onConflict: "event_id" });
  if (dbError) return { status: "error", message: "Nie udało się zapisać ustawień." };

  const check = await loadBoothData(() => flagRequestsOutsideWindows(ctx.event, settings));
  revalidate(eventId);
  if (!check.ok) {
    return { status: "error", message: "Ustawienia zapisane, ale nie udało się wczytać wniosków, żeby sprawdzić godziny. Odśwież stronę." };
  }
  const flagged = check.value;
  return {
    status: "success",
    message:
      flagged > 0
        ? `Ustawienia zapisane. ${flagged} ${pluralizePl(flagged, ["wniosek ma", "wnioski mają", "wniosków ma"])} godziny poza nowymi oknami — oznaczone „do poprawy”, partnerzy dostali e-mail.`
        : "Ustawienia zapisane.",
  };
}

/**
 * Po zmianie okien: wnioski z godzinami poza oknem → „do poprawy” (+ e-mail do partnera przy
 * nowym oznaczeniu); mieszczące się → flaga zdjęta. Bez okna dla danego etapu brak ograniczeń.
 * Zwraca liczbę nowo oznaczonych wniosków. Błąd wysyłki nie cofa zapisu.
 */
async function flagRequestsOutsideWindows(
  event: { id: string; name: string; timezone: string | null },
  settings: LogisticsSettings,
): Promise<number> {
  const outside = (start: string | null, end: string | null, windows: LogisticsSettings["setup_windows"]) => {
    if (windows.length === 0 || (!start && !end)) return false;
    const slot = toLocalSlot(start, end, event.timezone);
    return !slot || !slotWithinWindows(slot, windows);
  };
  const admin = createAdminClient();
  const requests = await getEventBoothRequests(event.id);
  const origin = getOrigin(await headers());
  let flagged = 0;
  for (const r of requests) {
    const needFix =
      outside(r.setup_start, r.setup_end, settings.setup_windows) ||
      outside(r.teardown_start, r.teardown_end, settings.teardown_windows);
    if (needFix === r.times_need_fix) continue;
    const { error } = await admin
      .from("partner_booth_requests")
      .update({ times_need_fix: needFix })
      .eq("id", r.id)
      .eq("event_id", event.id);
    if (error || !needFix) continue;
    flagged += 1;
    const { data: partner } = await admin.from("partners").select("name").eq("id", r.partner_id).maybeSingle();
    const recipients = await getPartnerRecipientEmails(r.partner_id);
    const results = await Promise.allSettled(
      recipients.map((to) =>
        sendBoothTimesNeedFixEmail({
          to,
          partnerName: (partner?.name as string | undefined) ?? "",
          eventName: event.name,
          setupWindows: settings.setup_windows,
          teardownWindows: settings.teardown_windows,
          panelUrl: `${origin}/partner/${r.partner_id}`,
        }),
      ),
    );
    for (const f of results) if (f.status === "rejected") console.error("[booth-requests] need-fix email failed", f.reason instanceof Error ? f.reason.message : f.reason);
  }
  return flagged;
}

export async function saveCatalogItem(
  eventId: string,
  itemId: string | null,
  _prev: LogisticsState,
  formData: FormData,
): Promise<LogisticsState> {
  const ctx = await organizerEvent(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (itemId !== null && !UUID.test(itemId)) return { status: "error", message: "Pozycja nie istnieje." };

  const parsed = validateCatalogInput((k) => formData.get(k));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const admin = createAdminClient();
  if (itemId) {
    const { data, error } = await admin
      .from("booth_catalog_items")
      .update(parsed.value)
      .eq("id", itemId)
      .eq("event_id", eventId)
      .select("id");
    if (error) return { status: "error", message: "Nie udało się zapisać pozycji." };
    if (!data?.length) return { status: "error", message: "Pozycja nie istnieje." };
  } else {
    const loaded = await loadBoothData(() => getCatalog(eventId));
    if (!loaded.ok) return { status: "error", message: "Nie udało się wczytać katalogu. Odśwież stronę." };
    const catalog = loaded.value;
    if (catalog.length >= MAX_CATALOG_ITEMS) {
      return { status: "error", message: `Katalog może mieć najwyżej ${MAX_CATALOG_ITEMS} pozycji.` };
    }
    const { error } = await admin.from("booth_catalog_items").insert({
      ...parsed.value,
      event_id: eventId,
      sort_order: Math.max(-1, ...catalog.map((c) => c.sort_order)) + 1,
    });
    if (error) return { status: "error", message: "Nie udało się dodać pozycji." };
  }

  revalidate(eventId);
  return { status: "success", message: itemId ? "Pozycja zapisana." : "Pozycja dodana." };
}

/**
 * Usunięcie pozycji. Pozycja już zamówiona przez partnera zostaje (historia wniosków),
 * tylko przestaje być dostępna w formularzu — dezaktywacja zamiast usunięcia.
 */
export async function deleteCatalogItem(eventId: string, itemId: string): Promise<LogisticsState> {
  const ctx = await organizerEvent(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(itemId)) return { status: "error", message: "Pozycja nie istnieje." };

  const admin = createAdminClient();
  const { count } = await admin
    .from("partner_booth_request_items")
    .select("id", { count: "exact", head: true })
    .eq("catalog_item_id", itemId);
  const used = (count ?? 0) > 0;
  const query = used
    ? admin.from("booth_catalog_items").update({ active: false }).eq("id", itemId).eq("event_id", eventId).select("id")
    : admin.from("booth_catalog_items").delete().eq("id", itemId).eq("event_id", eventId).select("id");
  const { data, error } = await query;
  if (error) return { status: "error", message: "Nie udało się usunąć pozycji." };
  if (!data?.length) return { status: "error", message: "Pozycja nie istnieje." };

  revalidate(eventId);
  return {
    status: "success",
    message: used
      ? "Pozycja jest w złożonych wnioskach — wyłączyliśmy ją zamiast usuwać (zamówienia zostają)."
      : "Pozycja usunięta.",
  };
}
