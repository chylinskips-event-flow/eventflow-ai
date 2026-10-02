export const runtime = "nodejs";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured, syncSubscription } from "@/lib/billing";

/** Zdarzenia, które zmieniają stan subskrypcji organizacji. */
const HANDLED = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function subscriptionIdFromEvent(event: Stripe.Event): string | null {
  const ref = (value: string | { id: string } | null | undefined) =>
    typeof value === "string" ? value : (value?.id ?? null);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      return session.mode === "subscription" ? ref(session.subscription) : null;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "invoice.paid":
    case "invoice.payment_failed":
      return ref(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured()) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // Podpis liczony z surowego body — nie parsować JSON przed weryfikacją.
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (seen) return Response.json({ received: true, duplicate: true });

  try {
    const subscriptionId = subscriptionIdFromEvent(event);
    if (subscriptionId) {
      const result = await syncSubscription(subscriptionId);
      if (result.outcome === "skipped") {
        console.warn(`[stripe-webhook] ${event.type} ${event.id}: ${result.reason}`);
      }
    }
    if (event.type === "invoice.payment_failed") {
      // Stripe sam przestawia subskrypcję na past_due (okres łaski) — stan zsynchronizowany wyżej.
      console.warn(`[stripe-webhook] payment failed for subscription ${subscriptionId}`);
    }
  } catch (err) {
    console.error(
      `[stripe-webhook] ${event.type} ${event.id} failed:`,
      err instanceof Error ? err.message : err,
    );
    // 500 → Stripe ponowi; zdarzenie nie jest oznaczone jako przetworzone.
    return new Response("Processing failed", { status: 500 });
  }

  // Oznacz jako przetworzone dopiero po sukcesie (ON CONFLICT przy równoległej dostawie).
  await admin
    .from("stripe_webhook_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });

  return Response.json({ received: true });
}
