"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";
import { getTicketTypes } from "@/lib/tickets";
import { featureGate } from "@/lib/entitlements";
import { parseOptionalDateTimeLocal } from "@/lib/format";

/**
 * Okno dat z pól datetime-local: godziny wpisane w strefie wydarzenia (domyślnie Europe/Warsaw),
 * zapisywane jako UTC. Zwraca komunikat błędu albo parę ISO / null.
 */
function parseDateWindow(
  startRaw: FormDataEntryValue | null,
  endRaw: FormDataEntryValue | null,
  timeZone: string | null,
): { start: string | null; end: string | null } | string {
  const start = parseOptionalDateTimeLocal(startRaw, timeZone);
  const end = parseOptionalDateTimeLocal(endRaw, timeZone);
  if (start === undefined || end === undefined) return "Nieprawidłowa data.";
  if (start && end && Date.parse(end) <= Date.parse(start))
    return "Data końca musi być późniejsza niż data początku.";
  return { start, end };
}

// ---- Ticket types --------------------------------------------------------

export type TicketTypeFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function createTicketType(
  eventId: string,
  _prev: TicketTypeFormState,
  formData: FormData,
): Promise<TicketTypeFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Brak dostępu." };

  const name = formData.get("name");
  const description = formData.get("description");
  const pricePln = formData.get("price_pln");
  const quantityTotal = formData.get("quantity_total");
  const salesWindow = parseDateWindow(formData.get("sales_start"), formData.get("sales_end"), event.timezone);

  if (typeof name !== "string" || !name.trim())
    return { status: "error", message: "Nazwa jest wymagana." };
  if (typeof salesWindow === "string") return { status: "error", message: salesWindow };

  const price = pricePln
    ? Math.round(parseFloat(String(pricePln).replace(",", ".")) * 100)
    : 0;
  if (isNaN(price) || price < 0)
    return { status: "error", message: "Nieprawidłowa cena." };
  if (price > 0) {
    const gate = await featureGate(event.organization_id, "tickets_paid");
    if (!gate.ok) return { status: "error", message: gate.message };
  }

  const quantityTotalVal =
    typeof quantityTotal === "string" && quantityTotal.trim()
      ? parseInt(quantityTotal, 10)
      : null;
  if (quantityTotalVal !== null && (isNaN(quantityTotalVal) || quantityTotalVal < 1))
    return { status: "error", message: "Limit musi być dodatnią liczbą całkowitą." };

  const existing = await getTicketTypes(eventId);
  const maxPos = existing.reduce((m, t) => Math.max(m, t.position), -1);

  const supabase = createAdminClient();
  const { error } = await supabase.from("ticket_types").insert({
    event_id: eventId,
    name: name.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    price,
    quantity_total: quantityTotalVal,
    sales_start: salesWindow.start,
    sales_end: salesWindow.end,
    position: maxPos + 1,
    enabled: true,
  });

  if (error) return { status: "error", message: "Nie udało się dodać. Spróbuj ponownie." };

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { status: "success", message: "Typ biletu dodany." };
}

export async function updateTicketType(
  eventId: string,
  ticketTypeId: string,
  _prev: TicketTypeFormState,
  formData: FormData,
): Promise<TicketTypeFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Brak dostępu." };

  const name = formData.get("name");
  const description = formData.get("description");
  const pricePln = formData.get("price_pln");
  const quantityTotal = formData.get("quantity_total");
  const salesWindow = parseDateWindow(formData.get("sales_start"), formData.get("sales_end"), event.timezone);
  const enabled = formData.get("enabled") === "on";

  if (typeof name !== "string" || !name.trim())
    return { status: "error", message: "Nazwa jest wymagana." };
  if (typeof salesWindow === "string") return { status: "error", message: salesWindow };

  const price = pricePln
    ? Math.round(parseFloat(String(pricePln).replace(",", ".")) * 100)
    : 0;
  if (isNaN(price) || price < 0)
    return { status: "error", message: "Nieprawidłowa cena." };

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("ticket_types")
    .select("price")
    .eq("id", ticketTypeId)
    .eq("event_id", eventId)
    .maybeSingle<{ price: number }>();
  if (!current) return { status: "error", message: "Typ biletu nie istnieje." };

  // Bramka planu tylko przy ustawianiu nowej ceny płatnej. Istniejący płatny typ po zmianie planu
  // na niższy da się dalej edytować i wyłączyć; publiczna strona i kasa go nie sprzedają.
  if (price > 0 && price !== current.price) {
    const gate = await featureGate(event.organization_id, "tickets_paid");
    if (!gate.ok) return { status: "error", message: gate.message };
  }

  const quantityTotalVal =
    typeof quantityTotal === "string" && quantityTotal.trim()
      ? parseInt(quantityTotal, 10)
      : null;
  if (quantityTotalVal !== null && (isNaN(quantityTotalVal) || quantityTotalVal < 1))
    return { status: "error", message: "Limit musi być dodatnią liczbą całkowitą." };

  const { error } = await supabase
    .from("ticket_types")
    .update({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      price,
      quantity_total: quantityTotalVal,
      sales_start: salesWindow.start,
      sales_end: salesWindow.end,
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketTypeId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udało się zapisać. Spróbuj ponownie." };

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { status: "success", message: "Zapisano." };
}

const TICKET_TYPE_HAS_ORDERS_MESSAGE =
  "Nie można usunąć typu biletu, który ma zamówienia — wyłącz sprzedaż.";

export type DeleteTicketTypeResult = { ok: true } | { ok: false; message: string };

/**
 * Usuwa typ biletu bez zamówień. Typ z zamówieniami (także oczekującymi i anulowanymi) zostaje —
 * zamówienia i bilety się do niego odwołują; organizator może wyłączyć jego sprzedaż.
 * Kody rabatowe przypisane do usuwanego typu wyłącza wyzwalacz w bazie, żeby nie zaczęły
 * działać na wszystkie typy biletów.
 */
export async function deleteTicketType(
  eventId: string,
  ticketTypeId: string,
): Promise<DeleteTicketTypeResult> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, message: "Brak dostępu." };

  const supabase = createAdminClient();
  const { count, error: countError } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("ticket_type_id", ticketTypeId);
  if (countError) return { ok: false, message: "Nie udało się usunąć. Spróbuj ponownie." };
  if ((count ?? 0) > 0) return { ok: false, message: TICKET_TYPE_HAS_ORDERS_MESSAGE };

  const { error } = await supabase
    .from("ticket_types")
    .delete()
    .eq("id", ticketTypeId)
    .eq("event_id", eventId);

  if (error) {
    // 23503: zamówienie powstało między sprawdzeniem a usunięciem (klucz obcy RESTRICT).
    if ((error as { code?: string }).code === "23503")
      return { ok: false, message: TICKET_TYPE_HAS_ORDERS_MESSAGE };
    return { ok: false, message: "Nie udało się usunąć. Spróbuj ponownie." };
  }

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { ok: true };
}

export async function toggleTicketType(
  eventId: string,
  ticketTypeId: string,
  enabled: boolean,
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  await supabase
    .from("ticket_types")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", ticketTypeId)
    .eq("event_id", eventId);

  revalidatePath(`/admin/events/${eventId}/tickets`);
}

// ---- Discount codes -------------------------------------------------------

export type DiscountCodeFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function createDiscountCode(
  eventId: string,
  _prev: DiscountCodeFormState,
  formData: FormData,
): Promise<DiscountCodeFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Brak dostepu." };
  const gate = await featureGate(event.organization_id, "tickets_paid");
  if (!gate.ok) return { status: "error", message: gate.message };

  const code = formData.get("code");
  const kind = formData.get("kind");
  const valueRaw = formData.get("value");
  const maxUses = formData.get("max_uses");
  const validity = parseDateWindow(formData.get("valid_from"), formData.get("valid_until"), event.timezone);

  if (typeof code !== "string" || !code.trim())
    return { status: "error", message: "Kod jest wymagany." };
  if (kind !== "percent" && kind !== "amount")
    return { status: "error", message: "Wybierz typ rabatu." };
  if (typeof validity === "string") return { status: "error", message: validity };

  const value = typeof valueRaw === "string" ? parseInt(valueRaw, 10) : NaN;
  if (isNaN(value) || value <= 0)
    return { status: "error", message: "Wartosc musi byc wieksza od 0." };
  if (kind === "percent" && value > 100)
    return { status: "error", message: "Procent nie moze przekraczac 100." };

  const maxUsesVal =
    typeof maxUses === "string" && maxUses.trim()
      ? parseInt(maxUses, 10)
      : null;

  const supabase = createAdminClient();
  const { error } = await supabase.from("discount_codes").insert({
    event_id: eventId,
    code: code.trim().toUpperCase(),
    kind,
    value,
    max_uses: maxUsesVal,
    valid_from: validity.start,
    valid_until: validity.end,
    enabled: true,
  });

  if (error) {
    if (error.code === "23505")
      return { status: "error", message: "Taki kod juz istnieje dla tego eventu." };
    return { status: "error", message: "Nie udalo sie dodac kodu." };
  }

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { status: "success", message: "Kod rabatowy dodany." };
}

export async function deleteDiscountCode(
  eventId: string,
  codeId: string,
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  await supabase
    .from("discount_codes")
    .delete()
    .eq("id", codeId)
    .eq("event_id", eventId);

  revalidatePath(`/admin/events/${eventId}/tickets`);
}
