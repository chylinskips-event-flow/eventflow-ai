import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Check } from "lucide-react";
import { getOwnOrganization } from "@/lib/organizations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  getEntitlements,
  isBillingEnabled,
} from "@/lib/entitlements";
import {
  getOrganizationSubscription,
  getPriceIdForPlan,
  getStripe,
  getStripeCustomerId,
  isStripeConfigured,
} from "@/lib/billing";
import { PURCHASABLE_PLAN_KEYS, type BillingInterval } from "@/lib/billing-core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { openPortal, startCheckout } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  trialing: "Okres próbny",
  active: "Aktywna",
  past_due: "Zaległa płatność",
  canceled: "Anulowana",
  incomplete: "Niedokończona",
  unpaid: "Nieopłacona",
};

const ERROR_MESSAGES: Record<string, string> = {
  disabled: "Płatności za platformę są wyłączone.",
  invalid_plan: "Nieprawidłowy plan.",
  has_subscription: "Masz już aktywną subskrypcję — zmień plan przez „Zarządzaj subskrypcją”.",
  price_missing: "Ten plan nie ma jeszcze skonfigurowanej ceny w Stripe.",
  no_customer: "Nie masz jeszcze konta rozliczeniowego — najpierw wybierz plan.",
  stripe: "Nie udało się połączyć ze Stripe. Spróbuj ponownie za chwilę.",
};

const LIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

type PlanRow = {
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  features: Record<string, boolean> | null;
  limits: Record<string, number | null> | null;
};

type PriceInfo = { amount: number; currency: string; interval: string | null };

function formatDate(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" }).format(new Date(iso))
    : null;
}

function formatPrice(p: PriceInfo) {
  const amount = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: p.currency.toUpperCase(),
  }).format(p.amount / 100);
  const per = p.interval === "year" ? " / rok" : p.interval === "month" ? " / mies." : "";
  return `${amount}${per} netto`;
}

async function getPrice(planKey: string, interval: BillingInterval): Promise<{ id: string; info: PriceInfo | null } | null> {
  const id = await getPriceIdForPlan(planKey, interval);
  if (!id) return null;
  try {
    const price = await getStripe().prices.retrieve(id);
    return {
      id,
      info:
        price.unit_amount != null
          ? { amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval ?? null }
          : null,
    };
  } catch {
    return { id, info: null };
  }
}

function limitLabel(key: string, value: number | null | undefined) {
  if (key === "max_attendees_per_event")
    return value == null ? "Uczestnicy bez limitu" : `Do ${value} uczestników na event`;
  if (key === "max_events")
    return value == null ? "Eventy bez limitu" : `Do ${value} aktywnych eventów`;
  return null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const organization = await getOwnOrganization();
  if (!organization) redirect("/onboarding");

  const { checkout, error } = await searchParams;
  const billingEnabled = isBillingEnabled();
  const stripeReady = billingEnabled && isStripeConfigured();

  const [entitlements, subscription, customerId] = await Promise.all([
    getEntitlements(organization.id),
    billingEnabled ? getOrganizationSubscription(organization.id) : null,
    stripeReady ? getStripeCustomerId(organization.id) : null,
  ]);

  const hasLiveSubscription = Boolean(
    subscription?.stripe_subscription_id && LIVE_STATUSES.has(subscription.status),
  );

  let plans: PlanRow[] = [];
  const prices: Record<string, { monthly: Awaited<ReturnType<typeof getPrice>>; yearly: Awaited<ReturnType<typeof getPrice>> }> = {};
  if (billingEnabled) {
    const { data } = await createAdminClient()
      .from("plans")
      .select("key, name, sort_order, is_active, features, limits")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    plans = (data ?? []) as PlanRow[];
    if (stripeReady) {
      await Promise.all(
        PURCHASABLE_PLAN_KEYS.map(async (key) => {
          const [monthly, yearly] = await Promise.all([
            getPrice(key, "monthly"),
            getPrice(key, "yearly"),
          ]);
          prices[key] = { monthly, yearly };
        }),
      );
    }
  }

  const awaitingWebhook = checkout === "success" && !hasLiveSubscription;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-2 border-b bg-background px-6 py-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ChevronLeft className="size-4" />
            Wydarzenia
          </Link>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Plan i płatności</h1>
          <p className="mt-1 text-sm text-muted-foreground">{organization.name}</p>
        </div>

        {error && ERROR_MESSAGES[error] && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {ERROR_MESSAGES[error]}
          </p>
        )}
        {awaitingWebhook && (
          <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
            Płatność przyjęta przez Stripe — aktywujemy plan po potwierdzeniu (zwykle kilka sekund).
            Odśwież stronę za chwilę.
          </p>
        )}
        {checkout === "cancel" && (
          <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
            Płatność anulowana — plan bez zmian.
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Aktualny plan</CardTitle>
            <CardDescription>
              {!billingEnabled
                ? "Pilotaż — pełny dostęp do wszystkich funkcji, bez opłat."
                : entitlements.source === "override"
                  ? "Plan przyznany indywidualnie."
                  : entitlements.source === "subscription"
                    ? "Plan z subskrypcji Stripe."
                    : "Brak subskrypcji — plan podstawowy."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold">
                {billingEnabled ? (entitlements.planName ?? "—") : "Pełny dostęp"}
              </span>
              {subscription && (
                <Badge variant={LIVE_STATUSES.has(subscription.status) ? "success" : "secondary"}>
                  {STATUS_LABELS[subscription.status] ?? subscription.status}
                </Badge>
              )}
            </div>
            {subscription && (
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {subscription.status === "trialing" && subscription.trial_ends_at && (
                  <li>Okres próbny do {formatDate(subscription.trial_ends_at)}</li>
                )}
                {subscription.current_period_end && LIVE_STATUSES.has(subscription.status) && (
                  <li>
                    {subscription.cancel_at_period_end
                      ? `Subskrypcja wygaśnie ${formatDate(subscription.current_period_end)}`
                      : `Następne odnowienie ${formatDate(subscription.current_period_end)}`}
                  </li>
                )}
                {subscription.status === "past_due" && (
                  <li className="text-destructive">
                    Ostatnia płatność nie powiodła się — zaktualizuj kartę w „Zarządzaj subskrypcją”.
                  </li>
                )}
              </ul>
            )}
            {stripeReady && customerId && (
              <form action={openPortal}>
                <Button type="submit" variant="outline">
                  Zarządzaj subskrypcją
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {billingEnabled && plans.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = entitlements.planKey === plan.key;
              const planPrices = prices[plan.key];
              const purchasable = (PURCHASABLE_PLAN_KEYS as readonly string[]).includes(plan.key);
              const features = FEATURE_KEYS.filter((k) => plan.features?.[k]);
              return (
                <Card key={plan.key} className={isCurrent ? "border-primary" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {plan.name}
                      {isCurrent && <Badge variant="indigo">Twój plan</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {plan.key === "free"
                        ? "0 zł"
                        : plan.key === "enterprise"
                          ? "Wycena indywidualna"
                          : planPrices?.monthly?.info
                            ? formatPrice(planPrices.monthly.info)
                            : "Cena wkrótce"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {["max_attendees_per_event", "max_events"].map((k) => {
                        const label = limitLabel(k, plan.limits?.[k]);
                        return label ? (
                          <li key={k} className="flex gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            {label}
                          </li>
                        ) : null;
                      })}
                      {features.map((k) => (
                        <li key={k} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          {FEATURE_LABELS[k]}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto flex flex-col gap-2">
                      {purchasable && stripeReady && !hasLiveSubscription && !isCurrent && (
                        <>
                          {planPrices?.monthly && (
                            <form action={startCheckout}>
                              <input type="hidden" name="plan" value={plan.key} />
                              <input type="hidden" name="interval" value="monthly" />
                              <Button type="submit" className="w-full">
                                Wybierz {plan.name}
                              </Button>
                            </form>
                          )}
                          {planPrices?.yearly && (
                            <form action={startCheckout}>
                              <input type="hidden" name="plan" value={plan.key} />
                              <input type="hidden" name="interval" value="yearly" />
                              <Button type="submit" variant="outline" className="w-full">
                                Rocznie
                                {planPrices.yearly.info ? ` — ${formatPrice(planPrices.yearly.info)}` : ""}
                              </Button>
                            </form>
                          )}
                        </>
                      )}
                      {purchasable && hasLiveSubscription && !isCurrent && (
                        <p className="text-xs text-muted-foreground">
                          Zmiana planu — przez „Zarządzaj subskrypcją”.
                        </p>
                      )}
                      {plan.key === "enterprise" && !isCurrent && (
                        <p className="text-xs text-muted-foreground">
                          Skontaktuj się z nami, aby ustalić warunki.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
