"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { getOrigin } from "@/lib/request-origin";
import { isBillingEnabled } from "@/lib/entitlements";
import {
  createSubscriptionCheckout,
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
  let alreadySubscribed = false;
  try {
    const customerId = await getOrCreateStripeCustomer({
      id: organization.id,
      name: organization.name,
      email: organization.billing_email ?? user?.email ?? null,
    });
    // Trial tylko przy pierwszej subskrypcji organizacji.
    const trialDays = current ? 0 : await getTrialDays(planKey);
    const origin = getOrigin(await headers());

    // Sprawdza subskrypcje w Stripe, ponownie używa otwartej sesji i stosuje klucz
    // idempotencji — równoległe Checkouty nie dają drugiej subskrypcji.
    const result = await createSubscriptionCheckout({
      organizationId: organization.id,
      customerId,
      planKey,
      priceId,
      trialDays,
      successUrl: `${origin}${BILLING_PATH}?checkout=success`,
      cancelUrl: `${origin}${BILLING_PATH}?checkout=cancel`,
    });
    if (result.kind === "has_subscription") alreadySubscribed = true;
    else url = result.url;
  } catch (err) {
    console.error(
      "[billing] checkout session failed:",
      err instanceof Error ? err.message : err,
    );
    fail("stripe");
  }

  // Subskrypcja istnieje już w Stripe, choć webhook mógł jeszcze nie dotrzeć.
  if (alreadySubscribed) fail("has_subscription");
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
