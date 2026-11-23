"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import { buildEventApexUrl, buildEventInternalPath } from "@/lib/event-url";
import {
  sendAttendeeConfirmationEmail,
  sendAttendeePendingApprovalEmail,
} from "@/lib/email/attendee-confirmation";
import {
  ATTENDEE_TOKEN_COOKIE,
  ATTENDEE_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/attendee-session";
import { getRegistrationUnavailableReason, type Event } from "@/lib/events";
import { getPaymentConfig, registerTransaction, getP24BaseUrl } from "@/lib/p24";
import { randomUUID } from "crypto";
import { ATTENDEE_LIMIT_MESSAGE, hasFeature, isAttendeeLimitReached } from "@/lib/entitlements";
import { handleDuplicateRegistration } from "@/lib/duplicate-registration";
import {
  PENDING_ORDER_TTL_MINUTES,
  computeDiscountAmount,
  hasDiscountUsesLeft,
  initialAttendeeStatus,
  isWithinWindow,
  totalAfterDiscount,
} from "@/lib/checkout-core";

export type FreeCheckoutState = {
  status: "idle" | "error" | "already_registered";
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
    .is("deleted_at", null)
    .maybeSingle<Event>();

  if (!event)
    return { status: "error", message: "Wydarzenie nie istnieje." };
  const freeUnavailable = getRegistrationUnavailableReason(event);
  if (freeUnavailable) return { status: "error", message: freeUnavailable };

  // Bilet darmowy = rejestracja bez płatności: ten sam adres już zarejestrowany w tym
  // wydarzeniu → bez nowego rekordu i bez rezerwacji puli, link do panelu (jak „Wejdź ponownie”).
  const duplicateMessage = await handleDuplicateRegistration({
    eventId: event.id,
    slug: event.slug,
    email: email.trim(),
    headers: await headers(),
  });
  if (duplicateMessage) return { status: "already_registered", message: duplicateMessage };

  if (await isAttendeeLimitReached(event))
    return { status: "error", message: ATTENDEE_LIMIT_MESSAGE };

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

  const salesWindow = isWithinWindow(tt.sales_start, tt.sales_end);
  if (salesWindow === "before")
    return { status: "error", message: "Sprzedaż jeszcze nie rozpoczęta." };
  if (salesWindow === "after")
    return { status: "error", message: "Sprzedaż zakończona." };

  return issueFreeTicket({
    event,
    slug,
    ticketType: tt,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    marketingConsent,
    discountCodeId: null,
  });
}

/**
 * Zamówienie bez płatności (bilet darmowy albo rabat 100%): rezerwacja puli, uczestnik, zamówienie
 * opłacone na 0 zł, bilet, mail, ciasteczko i przekierowanie. Status uczestnika jak przy zwykłej
 * rejestracji: przy wydarzeniu z zatwierdzaniem — „pending” i mail o oczekiwaniu.
 * Wywoływać po walidacji wydarzenia, typu biletu, duplikatu i limitu uczestników.
 */
async function issueFreeTicket(params: {
  event: Event;
  slug: string;
  ticketType: { id: string; price: number; quantity_total: number | null };
  firstName: string;
  lastName: string;
  email: string;
  marketingConsent: boolean;
  discountCodeId: string | null;
}): Promise<FreeCheckoutState> {
  const { event, slug, ticketType: tt, marketingConsent, discountCodeId } = params;
  const supabase = createAdminClient();
  const eventId = event.id;
  const ticketTypeId = tt.id;
  const trimmedEmail = params.email;
  const trimmedFirst = params.firstName;
  const trimmedLast = params.lastName;
  const now = new Date().toISOString();
  const attendeeStatus = initialAttendeeStatus(event.requires_approval);

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
      status: attendeeStatus,
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
      buyer_first_name: trimmedFirst,
      buyer_last_name: trimmedLast,
      buyer_email: trimmedEmail,
      marketing_consent: marketingConsent,
      status: "paid",
      total_amount: 0,
      currency: "PLN",
      p24_session_id: sessionId,
      paid_at: now,
      discount_code_id: discountCodeId,
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
    unit_price: tt.price,
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

  // 7. Send confirmation email (best-effort) — przy zatwierdzaniu: mail o oczekiwaniu, bez QR.
  const headersList = await headers();
  const origin = getOrigin(headersList);
  try {
    if (attendeeStatus === "pending") {
      await sendAttendeePendingApprovalEmail({ to: trimmedEmail, firstName: trimmedFirst, event });
    } else {
      await sendAttendeeConfirmationEmail({
        to: trimmedEmail,
        firstName: trimmedFirst,
        event,
        qrCodeToken: attendee.qr_code_token,
        checkInToken: attendee.check_in_token,
        origin,
      });
    }
  } catch (err) {
    console.error("Failed to send ticket confirmation email:", err);
  }

  // 8. Set cookie
  const cookieStore = await cookies();
  cookieStore.set(ATTENDEE_TOKEN_COOKIE, attendee.qr_code_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });

  // Oczekujący na zatwierdzenie: ta sama strona co po zwykłej rejestracji z zatwierdzaniem.
  redirect(buildEventInternalPath(
    slug,
    attendeeStatus === "pending"
      ? `/welcome?name=${encodeURIComponent(trimmedFirst)}&status=pending`
      : `/checkout/success?name=${encodeURIComponent(trimmedFirst)}`,
    origin,
  ));
}

// ---- Paid checkout (P24) ---------------------------------------------------

export type PaidCheckoutState = {
  status: "idle" | "error" | "already_registered";
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

  const { data: dc } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("event_id", eventId)
    // Dokładne porównanie: kody są zapisywane wielkimi literami. Bez LIKE, bo PostgREST
    // traktuje „*” jak „%”, a symbol wieloznaczny pozwalał użyć kodu bez jego znajomości.
    .eq("code", code.trim().toUpperCase())
    .eq("enabled", true)
    .maybeSingle();

  if (!dc) return "Nieprawidlowy kod rabatowy.";
  const validity = isWithinWindow(dc.valid_from, dc.valid_until);
  if (validity === "before") return "Kod rabatowy jeszcze nieaktywny.";
  if (validity === "after") return "Kod rabatowy wygasl.";
  if (dc.ticket_type_id && dc.ticket_type_id !== ticketTypeId)
    return "Kod nie dotyczy wybranego typu biletu.";

  // Limit użyć: potwierdzone użycia (uses_count rośnie dopiero po płatności) + trwające płatności
  // z tym kodem, żeby równoległe zakupy nie przekroczyły max_uses.
  if (dc.max_uses !== null) {
    const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MINUTES * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("discount_code_id", dc.id)
      .eq("status", "pending")
      .gte("created_at", cutoff);
    if (!hasDiscountUsesLeft(dc, count ?? 0)) return "Kod rabatowy wyczerpany.";
  }

  return { discountAmount: computeDiscountAmount(unitPrice, dc), codeId: dc.id };
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
  const trimmedEmail = email.trim();
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const marketingConsent = formData.get("marketing_consent") === "on";

  // 1. Verify event
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle<Event>();
  if (!event) return { status: "error", message: "Wydarzenie nie istnieje." };
  const paidUnavailable = getRegistrationUnavailableReason(event);
  if (paidUnavailable) return { status: "error", message: paidUnavailable };
  if (!(await hasFeature(event.organization_id, "tickets_paid")))
    return { status: "error", message: "Sprzedaż biletów płatnych jest niedostępna dla tego wydarzenia." };
  if (await isAttendeeLimitReached(event))
    return { status: "error", message: ATTENDEE_LIMIT_MESSAGE };

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
  const salesWindow = isWithinWindow(tt.sales_start, tt.sales_end);
  if (salesWindow === "before") return { status: "error", message: "Sprzedaz jeszcze nie rozpoczeta." };
  if (salesWindow === "after") return { status: "error", message: "Sprzedaz zakonczona." };

  // 3. Discount code (server-side validation)
  let discountAmount = 0;
  let discountCodeId: string | null = null;
  if (typeof discountCodeRaw === "string" && discountCodeRaw.trim()) {
    const result = await validateDiscountCode(eventId, discountCodeRaw.trim(), ticketTypeId, tt.price);
    if (typeof result === "string") return { status: "error", message: result };
    discountAmount = result.discountAmount;
    discountCodeId = result.codeId;
  }

  const totalAmount = totalAfterDiscount(tt.price, discountAmount);

  // 4. Rabat pokrywa całą cenę (np. kod dla prelegenta): zamówienie bez płatności, bez P24
  // (bramka odrzuca transakcje na 0 zł). Użycie kodu liczone od razu, atomowo z limitem.
  if (totalAmount <= 0 && discountCodeId) {
    const duplicateMessage = await handleDuplicateRegistration({
      eventId: event.id,
      slug: event.slug,
      email: trimmedEmail,
      headers: await headers(),
    });
    if (duplicateMessage) return { status: "already_registered", message: duplicateMessage };

    const { data: codeUsed } = await supabase.rpc("try_use_discount_code", { p_code_id: discountCodeId });
    if (!codeUsed) return { status: "error", message: "Kod rabatowy wyczerpany." };

    // issueFreeTicket kończy się przekierowaniem; zwrócony stan oznacza błąd → oddajemy użycie kodu.
    const failed = await issueFreeTicket({
      event,
      slug,
      ticketType: tt,
      firstName: trimmedFirst,
      lastName: trimmedLast,
      email: trimmedEmail,
      marketingConsent,
      discountCodeId,
    });
    await supabase.rpc("release_discount_code_use", { p_code_id: discountCodeId });
    return failed.status === "already_registered" ? failed : { status: "error", message: failed.message };
  }

  // 5. Payment config (tylko gdy jest co płacić)
  const cfg = await getPaymentConfig(event.organization_id);
  if (!cfg || !cfg.enabled)
    return { status: "error", message: "Platnosci nie sa skonfigurowane dla tego wydarzenia." };

  // 6. Atomic quantity reservation
  if (tt.quantity_total !== null) {
    const { data: reserved } = await supabase.rpc("try_reserve_ticket_quantity", {
      p_ticket_type_id: ticketTypeId,
      p_quantity: 1,
    });
    if (!reserved) return { status: "error", message: "Brak dostepnych miejsc." };
  }

  // 7. Create pending order (imię, nazwisko i zgoda marketingowa trafią na bilet po płatności)
  const sessionId = `p24_${randomUUID()}`;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      event_id: eventId,
      buyer_name: `${trimmedFirst} ${trimmedLast}`,
      buyer_first_name: trimmedFirst,
      buyer_last_name: trimmedLast,
      buyer_email: trimmedEmail,
      marketing_consent: marketingConsent,
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

  // Licznik użyć kodu rośnie dopiero po potwierdzeniu płatności (confirm_paid_order w webhooku).

  // 9. Register P24 transaction
  const headersList = await headers();
  const origin = getOrigin(headersList);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const returnBase = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/e/${slug}`
    : buildEventApexUrl(slug, origin);

  const p24Result = await registerTransaction(cfg, {
    sessionId,
    amount: totalAmount,
    description: `${event.name} — ${tt.name}`,
    email: trimmedEmail,
    urlReturn: `${returnBase}/checkout/return?sessionId=${encodeURIComponent(sessionId)}`,
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
