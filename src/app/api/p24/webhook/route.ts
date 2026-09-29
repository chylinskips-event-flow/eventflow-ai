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
    .select("id, event_id, status, total_amount, buyer_name, buyer_email, p24_session_id")
    .eq("p24_session_id", sessionId)
    .maybeSingle();

  if (!order) {
    // Return 200 to stop P24 retrying an unknown session
    return NextResponse.json({ responseCode: 0 });
  }

  // 2. Already fulfilled — idempotency guard
  if (order.status !== "pending") {
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
  if (!verifyResult.ok) {
    console.error("P24 verify failed:", verifyResult.error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  // 8. Idempotent fulfillment: atomically mark order paid only if still pending
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      p24_order_id: String(orderId),
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending") // guard — ensures exactly-once
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    // Already fulfilled by a concurrent webhook or return-page callback
    return NextResponse.json({ responseCode: 0 });
  }

  // 9. Create tickets + attendees for all order items
  const { data: items } = await supabase
    .from("order_items")
    .select("ticket_type_id, quantity")
    .eq("order_id", order.id);

  const buyerFirstName = order.buyer_name.split(" ")[0] ?? order.buyer_name;
  let firstCheckInToken: string | null = null;
  let firstQrToken: string | null = null;

  for (const item of items ?? []) {
    for (let i = 0; i < item.quantity; i++) {
      const { data: attendee } = await supabase
        .from("attendees")
        .insert({
          event_id: order.event_id,
          first_name: buyerFirstName,
          last_name: order.buyer_name.slice(buyerFirstName.length).trim() || "-",
          email: order.buyer_email,
          gdpr_consent_at: new Date().toISOString(),
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
