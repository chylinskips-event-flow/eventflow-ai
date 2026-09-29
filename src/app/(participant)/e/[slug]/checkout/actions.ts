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
import { getPaymentConfig, registerTransaction, getP24BaseUrl } from "@/lib/p24";
import { randomUUID } from "crypto";

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

// ---- Paid checkout (P24) ---------------------------------------------------

export type PaidCheckoutState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Validates discount code server-side.
 * Returns { discountAmount, codeId } or error string.
 */
async function validateDiscountCode(
  eventId: string,
  code: string,
  ticketTypeId: string,
  unitPrice: number,
): Promise<{ discountAmount: number; codeId: string } | string> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: dc } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("event_id", eventId)
    .ilike("code", code)
    .eq("enabled", true)
    .maybeSingle();

  if (!dc) return "Nieprawidlowy kod rabatowy.";
  if (dc.valid_from && dc.valid_from > now) return "Kod rabatowy jeszcze nieaktywny.";
  if (dc.valid_until && dc.valid_until < now) return "Kod rabatowy wygasl.";
  if (dc.max_uses !== null && dc.uses_count >= dc.max_uses) return "Kod rabatowy wyczerpany.";
  if (dc.ticket_type_id && dc.ticket_type_id !== ticketTypeId)
    return "Kod nie dotyczy wybranego typu biletu.";

  let discountAmount: number;
  if (dc.kind === "percent") {
    discountAmount = Math.floor((unitPrice * dc.value) / 100);
  } else {
    discountAmount = dc.value;
  }
  discountAmount = Math.min(discountAmount, unitPrice);

  return { discountAmount, codeId: dc.id };
}

export async function startPaidCheckout(
  eventId: string,
  slug: string,
  ticketTypeId: string,
  _prev: PaidCheckoutState,
  formData: FormData,
): Promise<PaidCheckoutState> {
  const firstName = formData.get("first_name");
  const lastName = formData.get("last_name");
  const email = formData.get("email");
  const gdprConsent = formData.get("gdpr_consent");
  const discountCodeRaw = formData.get("discount_code");

  if (typeof firstName !== "string" || !firstName.trim())
    return { status: "error", message: "Podaj imie." };
  if (typeof lastName !== "string" || !lastName.trim())
    return { status: "error", message: "Podaj nazwisko." };
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))
    return { status: "error", message: "Podaj poprawny adres email." };
  if (!gdprConsent)
    return { status: "error", message: "Zgoda na przetwarzanie danych jest wymagana." };

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const trimmedEmail = email.trim();
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  // 1. Verify event
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<Event>();
  if (!event) return { status: "error", message: "Wydarzenie nie istnieje." };

  // 2. Verify ticket type server-side (price never from client)
  const { data: tt } = await supabase
    .from("ticket_types")
    .select("*")
    .eq("id", ticketTypeId)
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();

  if (!tt) return { status: "error", message: "Typ biletu niedostepny." };
  if (tt.price === 0) return { status: "error", message: "Uzyj formularza dla biletow darmowych." };
  if (tt.sales_start && tt.sales_start > now) return { status: "error", message: "Sprzedaz jeszcze nie rozpoczeta." };
  if (tt.sales_end && tt.sales_end < now) return { status: "error", message: "Sprzedaz zakonczona." };

  // 3. Payment config
  const cfg = await getPaymentConfig(event.organization_id);
  if (!cfg || !cfg.enabled)
    return { status: "error", message: "Platnosci nie sa skonfigurowane dla tego wydarzenia." };

  // 4. Discount code (server-side validation)
  let discountAmount = 0;
  let discountCodeId: string | null = null;
  if (typeof discountCodeRaw === "string" && discountCodeRaw.trim()) {
    const result = await validateDiscountCode(eventId, discountCodeRaw.trim(), ticketTypeId, tt.price);
    if (typeof result === "string") return { status: "error", message: result };
    discountAmount = result.discountAmount;
    discountCodeId = result.codeId;
  }

  const totalAmount = Math.max(0, tt.price - discountAmount);

  // 5. Atomic quantity reservation
  if (tt.quantity_total !== null) {
    const { data: reserved } = await supabase.rpc("try_reserve_ticket_quantity", {
      p_ticket_type_id: ticketTypeId,
      p_quantity: 1,
    });
    if (!reserved) return { status: "error", message: "Brak dostepnych miejsc." };
  }

  // 6. Create pending order
  const sessionId = `p24_${randomUUID()}`;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      event_id: eventId,
      buyer_name: `${trimmedFirst} ${trimmedLast}`,
      buyer_email: trimmedEmail,
      status: "pending",
      total_amount: totalAmount,
      currency: "PLN",
      p24_session_id: sessionId,
      discount_code_id: discountCodeId,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    if (tt.quantity_total !== null) {
      await supabase.rpc("unreserve_ticket_quantity", { p_ticket_type_id: ticketTypeId, p_quantity: 1 });
    }
    return { status: "error", message: "Nie udalo sie utworzyc zamowienia. Sprobuj ponownie." };
  }

  // 7. Create order item (price snapshot)
  await supabase.from("order_items").insert({
    order_id: order.id,
    ticket_type_id: ticketTypeId,
    quantity: 1,
    unit_price: tt.price,
    line_total: totalAmount,
  });

  // 8. Increment discount code uses_count (best-effort; race acceptable in MVP)
  if (discountCodeId) {
    const { data: currentDc } = await supabase
      .from("discount_codes")
      .select("uses_count")
      .eq("id", discountCodeId)
      .single();
    if (currentDc) {
      await supabase
        .from("discount_codes")
        .update({ uses_count: currentDc.uses_count + 1 })
        .eq("id", discountCodeId);
    }
  }

  // 9. Register P24 transaction
  const headersList = await headers();
  const origin = getOrigin(headersList);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  const p24Result = await registerTransaction(cfg, {
    sessionId,
    amount: totalAmount,
    description: `${event.name} — ${tt.name}`,
    email: trimmedEmail,
    urlReturn: `${appUrl}/e/${slug}/checkout/return?sessionId=${encodeURIComponent(sessionId)}`,
    urlStatus: `${appUrl}/api/p24/webhook`,
  });

  if (!p24Result.ok) {
    // Cancel order + unreserve on P24 failure
    await supabase.from("orders").update({ status: "failed" }).eq("id", order.id);
    if (tt.quantity_total !== null) {
      await supabase.rpc("unreserve_ticket_quantity", { p_ticket_type_id: ticketTypeId, p_quantity: 1 });
    }
    return { status: "error", message: `Blad rejestracji platnosci: ${p24Result.error}` };
  }

  // 10. Save token on order
  await supabase
    .from("orders")
    .update({ p24_token: p24Result.data.token })
    .eq("id", order.id);

  // 11. Redirect to P24 payment page
  const base = getP24BaseUrl(cfg.sandbox);
  redirect(`${base}/trnRequest/${p24Result.data.token}`);
}
