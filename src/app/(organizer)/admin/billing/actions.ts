"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { getOrigin } from "@/lib/request-origin";
import { isBillingEnabled } from "@/lib/entitlements";
import {
  getOrCreateStripeCustomer,
  getOrganizationSubscription,
  getPriceIdForPlan,
  getStripe,
  getStripeCustomerId,
  getTrialDays,
  isStripeConfigured,
} from "@/lib/billing";
import { isPurchasablePlanKey, type BillingInterval } from "@/lib/billing-core";

const BILLING_PATH = "/admin/billing";
const LIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

function fail(code: string): never {
  redirect(`${BILLING_PATH}?error=${code}`);
}

/** Checkout subskrypcji — tylko właściciel organizacji; plan i cena ustalane serwerowo. */
export async function startCheckout(formData: FormData): Promise<void> {
  if (!isBillingEnabled() || !isStripeConfigured()) fail("disabled");

  // getOwnOrganization zwraca wyłącznie organizację zalogowanego właściciela (RLS).
  const organization = await getOwnOrganization();
  if (!organization) redirect("/onboarding");

  const planKey = formData.get("plan");
  const interval: BillingInterval =
    formData.get("interval") === "yearly" ? "yearly" : "monthly";
  if (!isPurchasablePlanKey(planKey)) fail("invalid_plan");

  const current = await getOrganizationSubscription(organization.id);
  if (current?.stripe_subscription_id && LIVE_STATUSES.has(current.status)) {
    // Zmiana planu istniejącej subskrypcji idzie przez Customer Portal.
    fail("has_subscription");
  }

  const priceId = await getPriceIdForPlan(planKey, interval);
  if (!priceId) fail("price_missing");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let url: string | null = null;
  try {
    const customerId = await getOrCreateStripeCustomer({
      id: organization.id,
      name: organization.name,
      email: organization.billing_email ?? user?.email ?? null,
    });
    // Trial tylko przy pierwszej subskrypcji organizacji.
    const trialDays = current ? 0 : await getTrialDays(planKey);
    const origin = getOrigin(await headers());

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: organization.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { organization_id: organization.id, plan_key: planKey },
      subscription_data: {
        metadata: { organization_id: organization.id, plan_key: planKey },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      // Stripe Tax: VAT + reverse-charge B2B UE (NIP przez tax_id_collection).
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      success_url: `${origin}${BILLING_PATH}?checkout=success`,
      cancel_url: `${origin}${BILLING_PATH}?checkout=cancel`,
    });
    url = session.url;
  } catch (err) {
    console.error(
      "[billing] checkout session failed:",
      err instanceof Error ? err.message : err,
    );
    fail("stripe");
  }

  if (!url) fail("stripe");
  redirect(url);
}

/** Customer Portal — zmiana planu/karty, anulowanie, faktury. */
export async function openPortal(): Promise<void> {
  if (!isBillingEnabled() || !isStripeConfigured()) fail("disabled");

  const organization = await getOwnOrganization();
  if (!organization) redirect("/onboarding");

  const customerId = await getStripeCustomerId(organization.id);
  if (!customerId) fail("no_customer");

  let url: string | null = null;
  try {
    const origin = getOrigin(await headers());
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}${BILLING_PATH}`,
    });
    url = session.url;
  } catch (err) {
    console.error(
      "[billing] portal session failed:",
      err instanceof Error ? err.message : err,
    );
    fail("stripe");
  }

  if (!url) fail("stripe");
  redirect(url);
}
