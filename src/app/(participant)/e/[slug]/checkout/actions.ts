"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import { sendAttendeeConfirmationEmail } from "@/lib/email/attendee-confirmation";
import {
  ATTENDEE_TOKEN_COOKIE,
  ATTENDEE_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/attendee-session";
import type { Event } from "@/lib/events";

export type FreeCheckoutState = {
  status: "idle" | "error";
  message?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function completeFreeCheckout(
  eventId: string,
  slug: string,
  ticketTypeId: string,
  _prev: FreeCheckoutState,
  formData: FormData,
): Promise<FreeCheckoutState> {
  const firstName = formData.get("first_name");
  const lastName = formData.get("last_name");
  const email = formData.get("email");
  const gdprConsent = formData.get("gdpr_consent");
  const marketingConsent = formData.get("marketing_consent") === "on";

  if (typeof firstName !== "string" || !firstName.trim())
    return { status: "error", message: "Podaj imię." };
  if (typeof lastName !== "string" || !lastName.trim())
    return { status: "error", message: "Podaj nazwisko." };
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))
    return { status: "error", message: "Podaj poprawny adres email." };
  if (!gdprConsent)
    return { status: "error", message: "Zgoda na przetwarzanie danych jest wymagana." };

  const supabase = createAdminClient();

  // 1. Verify event + ticket type (server-side, amounts never from client)
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<Event>();

  if (!event)
    return { status: "error", message: "Wydarzenie nie istnieje." };

  const { data: tt } = await supabase
    .from("ticket_types")
    .select("*")
    .eq("id", ticketTypeId)
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();

  if (!tt)
    return { status: "error", message: "Typ biletu niedostępny." };
  if (tt.price !== 0)
    return { status: "error", message: "Ten bilet wymaga płatności." };

  const now = new Date().toISOString();
  if (tt.sales_start && tt.sales_start > now)
    return { status: "error", message: "Sprzedaż jeszcze nie rozpoczęta." };
  if (tt.sales_end && tt.sales_end < now)
    return { status: "error", message: "Sprzedaż zakończona." };

  // 2. Atomic quantity reservation (prevents oversell)
  if (tt.quantity_total !== null) {
    const { data: reserved } = await supabase
      .rpc("try_reserve_ticket_quantity", {
        p_ticket_type_id: ticketTypeId,
        p_quantity: 1,
      });
    if (!reserved)
      return { status: "error", message: "Brak dostępnych miejsc." };
  }

  const trimmedEmail = email.trim();
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  // 3. Create attendee
  const { data: attendee, error: attError } = await supabase
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: trimmedFirst,
      last_name: trimmedLast,
      email: trimmedEmail,
      gdpr_consent_at: now,
      marketing_consent: marketingConsent,
      status: "approved",
    })
    .select("id, qr_code_token, check_in_token")
    .single();

  if (attError || !attendee) {
    // Release reservation if attendee creation fails
    if (tt.quantity_total !== null) {
      await supabase.rpc("unreserve_ticket_quantity", {
        p_ticket_type_id: ticketTypeId,
        p_quantity: 1,
      });
    }
    return { status: "error", message: "Nie udalo sie zarejestrowac. Sprobuj ponownie." };
  }

  // 4. Create order (free → immediately paid)
  const sessionId = `free_${attendee.id}_${ticketTypeId}`;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      event_id: eventId,
      buyer_name: `${trimmedFirst} ${trimmedLast}`,
      buyer_email: trimmedEmail,
      status: "paid",
      total_amount: 0,
      currency: "PLN",
      p24_session_id: sessionId,
      paid_at: now,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    // Cleanup
    if (tt.quantity_total !== null) {
      await supabase.rpc("unreserve_ticket_quantity", {
        p_ticket_type_id: ticketTypeId,
        p_quantity: 1,
      });
    }
    await supabase.from("attendees").delete().eq("id", attendee.id);
    return { status: "error", message: "Nie udalo sie zarejestrowac. Sprobuj ponownie." };
  }

  // 5. Create order item
  await supabase.from("order_items").insert({
    order_id: order.id,
    ticket_type_id: ticketTypeId,
    quantity: 1,
    unit_price: 0,
    line_total: 0,
  });

  // 6. Create ticket — ticket_token = check_in_token (reception scanner unchanged)
  await supabase.from("tickets").insert({
    order_id: order.id,
    ticket_type_id: ticketTypeId,
    event_id: eventId,
    holder_name: `${trimmedFirst} ${trimmedLast}`,
    holder_email: trimmedEmail,
    ticket_token: attendee.check_in_token,
    attendee_id: attendee.id,
    status: "valid",
  });

  // 7. Send confirmation email (best-effort)
  try {
    const headersList = await headers();
    const origin = getOrigin(headersList);
    await sendAttendeeConfirmationEmail({
      to: trimmedEmail,
      firstName: trimmedFirst,
      event,
      qrCodeToken: attendee.qr_code_token,
      checkInToken: attendee.check_in_token,
      origin,
    });
  } catch (err) {
    console.error("Failed to send ticket confirmation email:", err);
  }

  // 8. Set cookie
  const cookieStore = await cookies();
  cookieStore.set(ATTENDEE_TOKEN_COOKIE, attendee.qr_code_token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });

  redirect(
    `/e/${slug}/checkout/success?name=${encodeURIComponent(trimmedFirst)}&email=${encodeURIComponent(trimmedEmail)}`,
  );
}
