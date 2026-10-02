import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapStripeStatus,
  planKeyForPrice,
  resolvePriceId,
  shouldApplySubscription,
  toIso,
  type BillingInterval,
  type PlanPriceRow,
} from "@/lib/billing-core";

// Server-only: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET nigdy nie trafiają do klienta ani logów.

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeClient ??= new Stripe(key, {
    appInfo: { name: "Eventro" },
    maxNetworkRetries: 2,
  });
  return stripeClient;
}

async function getPlanPriceRows(): Promise<PlanPriceRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plans")
    .select("key, stripe_price_id, stripe_price_yearly_id");
  if (error) {
    console.error("[billing] plans read failed:", error.message);
    return [];
  }
  return (data ?? []) as PlanPriceRow[];
}

export async function getPriceIdForPlan(
  planKey: string,
  interval: BillingInterval,
): Promise<string | null> {
  return resolvePriceId(planKey, interval, process.env, await getPlanPriceRows());
}

export async function getTrialDays(planKey: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("plans")
    .select("trial_days")
    .eq("key", planKey)
    .maybeSingle();
  const days = Number(data?.trial_days ?? 0);
  return Number.isInteger(days) && days > 0 ? Math.min(days, 730) : 0;
}

export type OrganizationSubscription = {
  plan_key: string;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
};

export async function getOrganizationSubscription(
  organizationId: string,
): Promise<OrganizationSubscription | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "plan_key, status, current_period_end, trial_ends_at, cancel_at_period_end, stripe_subscription_id",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[billing] subscription read failed:", error.message);
    return null;
  }
  return data as OrganizationSubscription | null;
}

export async function getStripeCustomerId(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

/**
 * Klient Stripe dla organizacji — tworzony raz. Klucz idempotencji chroni przed
 * zduplikowaniem klienta przy równoległych kliknięciach.
 */
export async function getOrCreateStripeCustomer(org: {
  id: string;
  name: string;
  email: string | null;
}): Promise<string> {
  const existing = await getStripeCustomerId(org.id);
  if (existing) return existing;

  const customer = await getStripe().customers.create(
    {
      name: org.name,
      email: org.email ?? undefined,
      metadata: { organization_id: org.id },
    },
    { idempotencyKey: `eventro-customer-${org.id}` },
  );

  const admin = createAdminClient();
  const { error } = await admin
    .from("billing_customers")
    .insert({ organization_id: org.id, stripe_customer_id: customer.id });
  if (error && error.code !== "23505") {
    throw new Error(`billing_customers insert failed: ${error.message}`);
  }
  // 23505 = równoległy zapis — zwróć to, co jest w bazie.
  return (await getStripeCustomerId(org.id)) ?? customer.id;
}

async function organizationIdForCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("billing_customers")
    .select("organization_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return row?.organization_id ?? null;
}

export type SyncResult =
  | { outcome: "updated"; organizationId: string; planKey: string; status: string }
  | { outcome: "skipped"; reason: string };

/**
 * Synchronizuje subskrypcję ze Stripe do tabeli subscriptions — zawsze na podstawie
 * AKTUALNEGO stanu pobranego z API (nie payloadu zdarzenia), więc kolejność i powtórzenia
 * webhooków nie mają znaczenia. entitlement_overrides nie są dotykane.
 */
export async function syncSubscription(subscriptionId: string): Promise<SyncResult> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Organizacja wyłącznie z naszego powiązania klienta (metadata tylko jako sprawdzenie spójności).
  const organizationId = await organizationIdForCustomer(customerId);
  if (!organizationId) {
    return { outcome: "skipped", reason: `unknown customer ${customerId}` };
  }
  if (sub.metadata?.organization_id && sub.metadata.organization_id !== organizationId) {
    console.error("[billing] subscription metadata org mismatch", sub.id);
    return { outcome: "skipped", reason: "organization mismatch" };
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const planKey = priceId
    ? planKeyForPrice(priceId, process.env, await getPlanPriceRows())
    : null;
  if (!planKey) {
    console.error("[billing] unknown Stripe price — plan not changed", priceId);
    return { outcome: "skipped", reason: `unknown price ${priceId}` };
  }

  const status = mapStripeStatus(sub.status);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!shouldApplySubscription(existing, { id: sub.id, status })) {
    return { outcome: "skipped", reason: "newer live subscription exists" };
  }

  const { error } = await admin.from("subscriptions").upsert(
    {
      organization_id: organizationId,
      plan_key: planKey,
      status,
      current_period_start: toIso(item?.current_period_start),
      current_period_end: toIso(item?.current_period_end),
      trial_ends_at: toIso(sub.trial_end),
      cancel_at_period_end: sub.cancel_at_period_end,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);

  return { outcome: "updated", organizationId, planKey, status };
}
