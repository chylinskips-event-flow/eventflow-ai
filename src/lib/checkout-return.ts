import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Powrót z płatności: przeglądarka, która rozpoczęła zakup, dostaje ciasteczko z identyfikatorem
 * sesji płatności. Po potwierdzeniu płatności ta sama przeglądarka może przejść do panelu
 * uczestnika bez linku z maila (jak po bilecie darmowym). Sam identyfikator z adresu nie
 * wystarcza — musi zgadzać się z ciasteczkiem ustawionym przy rozpoczęciu zakupu.
 */
export const CHECKOUT_SESSION_COOKIE = "eventflow_checkout_session";
export const CHECKOUT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 1 dzień

/** Czy przeglądarka rozpoczęła płatność o tym identyfikatorze sesji. */
export function isOwnCheckoutSession(
  cookieValue: string | null | undefined,
  sessionId: string | null | undefined,
): boolean {
  return Boolean(cookieValue && sessionId && cookieValue === sessionId);
}

/**
 * Token panelu (qr_code_token) uczestnika z opłaconego zamówienia o tej sesji płatności,
 * w obrębie wydarzenia o danym slugu. `null`, gdy zamówienie nie jest opłacone, bilet nie został
 * jeszcze wystawiony albo uczestnik nie jest zatwierdzony.
 */
export async function getPaidOrderAttendeeToken(
  sessionId: string,
  slug: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, event_id, status, events!inner(slug)")
    .eq("p24_session_id", sessionId)
    .eq("events.slug", slug)
    .maybeSingle<{ id: string; event_id: string; status: string }>();
  if (!order || order.status !== "paid") return null;

  const { data: ticket } = await supabase
    .from("tickets")
    .select("attendee_id")
    .eq("order_id", order.id)
    .eq("event_id", order.event_id)
    .eq("status", "valid")
    .not("attendee_id", "is", null)
    .limit(1)
    .maybeSingle<{ attendee_id: string }>();
  if (!ticket?.attendee_id) return null;

  const { data: attendee } = await supabase
    .from("attendees")
    .select("qr_code_token, status")
    .eq("id", ticket.attendee_id)
    .eq("event_id", order.event_id)
    .maybeSingle<{ qr_code_token: string; status: string }>();
  if (!attendee || attendee.status !== "approved") return null;

  return attendee.qr_code_token;
}
