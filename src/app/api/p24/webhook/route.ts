import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import {
  getPaymentConfig,
  computeNotifySign,
  verifyTransaction,
} from "@/lib/p24";
import { sendAttendeeConfirmationEmail } from "@/lib/email/attendee-confirmation";
import type { Event } from "@/lib/events";
import { buyerNameParts } from "@/lib/checkout-core";
import { getOrganizerEmail } from "@/lib/booth-requests";
import { sendOrderOverbookedEmail } from "@/lib/email/order-overbooked";

type P24Notification = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  sign: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: P24Notification;
  try {
    body = (await req.json()) as P24Notification;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    merchantId,
    posId,
    sessionId,
    amount,
    originAmount,
    currency,
    orderId,
    methodId,
    statement,
    sign,
  } = body;

  if (!sessionId || !sign) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Look up order by session_id (do NOT trust payload amount yet)
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, event_id, status, total_amount, currency, buyer_name, buyer_first_name, buyer_last_name, buyer_email, marketing_consent, p24_session_id, created_at",
    )
    .eq("p24_session_id", sessionId)
    .maybeSingle();

  if (!order) {
    // Return 200 to stop P24 retrying an unknown session
    return NextResponse.json({ responseCode: 0 });
  }

  // 2. Already fulfilled — idempotency guard. „cancelled” przechodzi dalej: rezerwacja mogła
  // wygasnąć (cron / brak powiadomienia w 20 min), a płatność i tak dojść — wtedy nie wolno
  // jej przemilczeć. Weryfikacja w P24 poniżej rozstrzyga, czy pieniądze faktycznie wpłynęły.
  if (order.status !== "pending" && order.status !== "cancelled") {
    return NextResponse.json({ responseCode: 0 });
  }

  // 3. Get event + organization_id for payment config
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", order.event_id)
    .maybeSingle<Event>();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 500 });
  }

  // 4. Get payment config (to obtain crc for signature verification)
  const cfg = await getPaymentConfig(event.organization_id);
  if (!cfg) {
    return NextResponse.json({ error: "Payment config not found" }, { status: 500 });
  }

  // 5. Verify P24 notification signature
  const expectedSign = computeNotifySign(
    merchantId,
    posId,
    sessionId,
    amount,
    originAmount,
    currency,
    orderId,
    methodId,
    statement,
    cfg.crc,
  );
  if (sign !== expectedSign) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 6. Verify amount matches what we stored (prevents manipulation)
  if (amount !== order.total_amount) {
    console.error(
      `P24 webhook amount mismatch: expected ${order.total_amount}, got ${amount}`,
    );
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  // 7. Server-side /transaction/verify — only trust after this
  const verifyResult = await verifyTransaction(cfg, {
    sessionId,
    orderId,
    amount,
  });

  // Weryfikacja nie doszła do skutku (sieć, 5xx, 429): nie wiemy, czy płatność przeszła.
  // Zamówienie zostaje oczekujące, a kod 503 sprawia, że P24 ponowi powiadomienie.
  if (!verifyResult.ok && verifyResult.retryable) {
    console.error("[p24-webhook] verify retryable failure:", verifyResult.error);
    return NextResponse.json({ error: "Verify unavailable" }, { status: 503 });
  }

  // P24 can call urlStatus for failed/cancelled payments too.
  // If verify fails → mark order cancelled and release the reserved pool.
  if (!verifyResult.ok || verifyResult.data.status !== "success") {
    const { data: cancelled } = await supabase
      .from("orders")
      .update({ status: "cancelled", p24_order_id: String(orderId) })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (cancelled) {
      // Release quantity for each order item
      const { data: items } = await supabase
        .from("order_items")
        .select("ticket_type_id, quantity")
        .eq("order_id", order.id);
      for (const item of items ?? []) {
        await supabase.rpc("unreserve_ticket_quantity", {
          p_ticket_type_id: item.ticket_type_id,
          p_quantity: item.quantity,
        });
      }
    }

    return NextResponse.json({ responseCode: 0 });
  }

  // 8. Idempotent fulfillment (SQL, atomowo): 'paid' gdy miejsce jest (aktywna rezerwacja albo
  // wolna pula po jej wygaśnięciu), 'paid_overbooked' gdy puli już nie ma, 'noop' gdy zamówienie
  // rozliczył równoległy webhook. Licznik kodu rabatowego rośnie tylko przy 'paid'.
  const { data: outcome, error: confirmError } = await supabase.rpc("confirm_paid_order", {
    p_order_id: order.id,
    p_p24_order_id: String(orderId),
  });

  if (confirmError) {
    // Płatność potwierdzona, zapis nieudany: 500, żeby P24 ponowiło powiadomienie.
    console.error("[p24-webhook] confirm_paid_order failed:", confirmError.message);
    return NextResponse.json({ error: "Confirm failed" }, { status: 500 });
  }

  if (outcome === "paid_overbooked") {
    // Bez biletu i bez automatycznego zwrotu: organizator dostaje powiadomienie i decyduje.
    console.error(`[p24-webhook] order ${order.id} paid after reservation expired; pool exhausted`);
    try {
      const to = await getOrganizerEmail(event.organization_id);
      if (to) {
        await sendOrderOverbookedEmail(to, {
          eventName: event.name,
          buyerName: order.buyer_name,
          buyerEmail: order.buyer_email,
          amount: order.total_amount,
          currency: order.currency ?? "PLN",
          sessionId: order.p24_session_id,
          p24OrderId: String(orderId),
        });
      }
    } catch (err) {
      console.error("P24 webhook: failed to notify organizer:", err);
    }
    return NextResponse.json({ responseCode: 0 });
  }

  if (outcome !== "paid") {
    // Already fulfilled by a concurrent webhook or return-page callback
    return NextResponse.json({ responseCode: 0 });
  }

  // 9. Create tickets + attendees for all order items
  const { data: items } = await supabase
    .from("order_items")
    .select("ticket_type_id, quantity")
    .eq("order_id", order.id);

  // Dane z formularza kasy (imię, nazwisko, zgoda marketingowa) zapisane na zamówieniu.
  const { firstName: buyerFirstName, lastName: buyerLastName } = buyerNameParts(order);
  let firstCheckInToken: string | null = null;
  let firstQrToken: string | null = null;

  for (const item of items ?? []) {
    for (let i = 0; i < item.quantity; i++) {
      const { data: attendee } = await supabase
        .from("attendees")
        .insert({
          event_id: order.event_id,
          first_name: buyerFirstName,
          last_name: buyerLastName,
          email: order.buyer_email,
          gdpr_consent_at: order.created_at ?? new Date().toISOString(),
          marketing_consent: order.marketing_consent === true,
          status: "approved",
        })
        .select("id, qr_code_token, check_in_token")
        .single();

      if (!attendee) continue;

      await supabase.from("tickets").insert({
        order_id: order.id,
        ticket_type_id: item.ticket_type_id,
        event_id: order.event_id,
        holder_name: order.buyer_name,
        holder_email: order.buyer_email,
        ticket_token: attendee.check_in_token, // QR on ticket = reception scanner token
        attendee_id: attendee.id,
        status: "valid",
      });

      if (!firstCheckInToken) {
        firstCheckInToken = attendee.check_in_token;
        firstQrToken = attendee.qr_code_token;
      }
    }
  }

  // 10. Send confirmation email (best-effort)
  if (firstCheckInToken && firstQrToken) {
    try {
      const origin = getOrigin(req.headers);
      await sendAttendeeConfirmationEmail({
        to: order.buyer_email,
        firstName: buyerFirstName,
        event,
        qrCodeToken: firstQrToken,
        checkInToken: firstCheckInToken,
        origin,
      });
    } catch (err) {
      console.error("P24 webhook: failed to send email:", err);
    }
  }

  // P24 expects { responseCode: 0 } on success
  return NextResponse.json({ responseCode: 0 });
}
