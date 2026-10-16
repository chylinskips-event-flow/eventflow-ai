"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDateTimeLocal } from "@/lib/format";
import { getCatalog } from "@/lib/booth-requests";
import {
  MAX_CATALOG_ITEMS,
  validateCatalogInput,
  validateSettings,
  type LogisticsSettings,
} from "@/lib/booth-requests-core";

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

  let invalid = false;
  const when = (k: keyof LogisticsSettings) => {
    const v = formData.get(k);
    if (typeof v !== "string" || !v.trim()) return null;
    if (!DATETIME.test(v.trim())) {
      invalid = true;
      return null;
    }
    return parseDateTimeLocal(v.trim(), ctx.event.timezone);
  };
  const settings: LogisticsSettings = {
    request_deadline: when("request_deadline"),
    setup_from: when("setup_from"),
    setup_to: when("setup_to"),
    teardown_from: when("teardown_from"),
    teardown_to: when("teardown_to"),
  };
  if (invalid) return { status: "error", message: "Niepoprawna data lub godzina." };
  const error = validateSettings(settings);
  if (error) return { status: "error", message: error };

  const { error: dbError } = await createAdminClient()
    .from("booth_logistics_settings")
    .upsert({ event_id: eventId, ...settings }, { onConflict: "event_id" });
  if (dbError) return { status: "error", message: "Nie udało się zapisać ustawień." };

  revalidate(eventId);
  return { status: "success", message: "Ustawienia zapisane." };
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
    const catalog = await getCatalog(eventId);
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
