// Czysta logika billingu Stripe (bez I/O) — testowalna jednostkowo.
// I/O (Stripe API, Supabase): src/lib/billing.ts.

/** Plany kupowane samoobsługowo przez Stripe Checkout (Free = brak subskrypcji, Enterprise = wycena). */
export const PURCHASABLE_PLAN_KEYS = ["pro", "business"] as const;
export type PurchasablePlanKey = (typeof PURCHASABLE_PLAN_KEYS)[number];

export type BillingInterval = "monthly" | "yearly";

export function isPurchasablePlanKey(value: unknown): value is PurchasablePlanKey {
  return (PURCHASABLE_PLAN_KEYS as readonly unknown[]).includes(value);
}

/** Kolumny cen Stripe z tabeli plans (fallback, gdy brak zmiennej środowiskowej). */
export type PlanPriceRow = {
  key: string;
  stripe_price_id: string | null;
  stripe_price_yearly_id: string | null;
};

type Env = Record<string, string | undefined>;

/**
 * ID ceny Stripe dla planu i okresu. Kolejność:
 *   STRIPE_PRICE_<PLAN>_<MONTHLY|YEARLY> → (miesięcznie) STRIPE_PRICE_<PLAN> → plans.stripe_price(_yearly)_id
 */
export function resolvePriceId(
  planKey: string,
  interval: BillingInterval,
  env: Env,
  plans: PlanPriceRow[],
): string | null {
  const prefix = `STRIPE_PRICE_${planKey.toUpperCase()}`;
  const fromEnv =
    interval === "yearly"
      ? env[`${prefix}_YEARLY`]
      : (env[`${prefix}_MONTHLY`] ?? env[prefix]);
  if (fromEnv?.trim()) return fromEnv.trim();

  const plan = plans.find((p) => p.key === planKey);
  const fromDb = interval === "yearly" ? plan?.stripe_price_yearly_id : plan?.stripe_price_id;
  return fromDb?.trim() || null;
}

/** Odwrotne mapowanie: cena Stripe → klucz planu (null = nieznana cena). */
export function planKeyForPrice(
  priceId: string,
  env: Env,
  plans: PlanPriceRow[],
): string | null {
  const keys = new Set<string>([
    ...PURCHASABLE_PLAN_KEYS,
    ...plans.map((p) => p.key),
  ]);
  for (const key of keys) {
    const prefix = `STRIPE_PRICE_${key.toUpperCase()}`;
    for (const name of [prefix, `${prefix}_MONTHLY`, `${prefix}_YEARLY`]) {
      if (env[name]?.trim() === priceId) return key;
    }
  }
  for (const plan of plans) {
    if (plan.stripe_price_id === priceId || plan.stripe_price_yearly_id === priceId) {
      return plan.key;
    }
  }
  return null;
}

/** Statusy w naszej tabeli subscriptions (CHECK w migracji Fazy A). */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return status;
    case "incomplete_expired":
      return "canceled";
    case "paused": // trial zakończony bez metody płatności
      return "unpaid";
    default:
      return "incomplete";
  }
}

const LIVE_STATUSES = new Set<SubscriptionStatus>(["trialing", "active", "past_due"]);

/**
 * Czy zdarzenie dla subskrypcji `incoming` może nadpisać obecny wiersz organizacji.
 * Chroni przed sytuacją: org ma nową, aktywną subskrypcję, a spóźniony webhook
 * starej (anulowanej) subskrypcji próbuje ją nadpisać.
 */
export function shouldApplySubscription(
  existing: { stripe_subscription_id: string | null; status: string } | null,
  incoming: { id: string; status: SubscriptionStatus },
): boolean {
  if (!existing || !existing.stripe_subscription_id) return true;
  if (existing.stripe_subscription_id === incoming.id) return true;
  // Inna subskrypcja: nadpisz tylko, jeśli obecna już nie obowiązuje albo nowa obowiązuje.
  return (
    !LIVE_STATUSES.has(existing.status as SubscriptionStatus) ||
    LIVE_STATUSES.has(incoming.status)
  );
}

/** Unix (s) → ISO; null-safe. */
export function toIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}
