"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";
import { getTicketTypes } from "@/lib/tickets";
import { featureGate } from "@/lib/entitlements";

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
  const salesStart = formData.get("sales_start");
  const salesEnd = formData.get("sales_end");

  if (typeof name !== "string" || !name.trim())
    return { status: "error", message: "Nazwa jest wymagana." };

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
    sales_start: typeof salesStart === "string" && salesStart ? salesStart : null,
    sales_end: typeof salesEnd === "string" && salesEnd ? salesEnd : null,
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
  const salesStart = formData.get("sales_start");
  const salesEnd = formData.get("sales_end");
  const enabled = formData.get("enabled") === "on";

  if (typeof name !== "string" || !name.trim())
    return { status: "error", message: "Nazwa jest wymagana." };

  const price = pricePln
    ? Math.round(parseFloat(String(pricePln).replace(",", ".")) * 100)
    : 0;
  if (isNaN(price) || price < 0)
    return { status: "error", message: "Nieprawidlowa cena." };
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

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ticket_types")
    .update({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      price,
      quantity_total: quantityTotalVal,
      sales_start: typeof salesStart === "string" && salesStart ? salesStart : null,
      sales_end: typeof salesEnd === "string" && salesEnd ? salesEnd : null,
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketTypeId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udalo sie zapisac. Sprobuj ponownie." };

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { status: "success", message: "Zapisano." };
}

export async function deleteTicketType(
  eventId: string,
  ticketTypeId: string,
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  await supabase
    .from("ticket_types")
    .delete()
    .eq("id", ticketTypeId)
    .eq("event_id", eventId);

  revalidatePath(`/admin/events/${eventId}/tickets`);
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
  const validFrom = formData.get("valid_from");
  const validUntil = formData.get("valid_until");

  if (typeof code !== "string" || !code.trim())
    return { status: "error", message: "Kod jest wymagany." };
  if (kind !== "percent" && kind !== "amount")
    return { status: "error", message: "Wybierz typ rabatu." };

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
    valid_from: typeof validFrom === "string" && validFrom ? validFrom : null,
    valid_until: typeof validUntil === "string" && validUntil ? validUntil : null,
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
