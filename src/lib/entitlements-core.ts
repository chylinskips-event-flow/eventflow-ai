// Czysta logika uprawnień (bez I/O) — testowalna jednostkowo.
// Dostęp do bazy i master flag: src/lib/entitlements.ts.

export const FEATURE_KEYS = [
  "registration",
  "reception_checkin",
  "tickets_free",
  "page_builder",
  "subdomains",
  "tickets_paid",
  "badges",
  "gamification",
  "gamification_rewards",
  "business_mixer",
  "live_qa",
  "photo_gallery",
  "ai_support",
  "custom_domain",
  "white_label",
  "sso",
  "api",
  "multi_edition",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = [
  "max_attendees_per_event",
  "max_events",
  "ticket_commission_pct",
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  registration: "Rejestracja",
  reception_checkin: "Recepcja i skaner QR",
  tickets_free: "Bilety darmowe",
  page_builder: "Kreator strony (sekcje treści)",
  subdomains: "Subdomena wydarzenia",
  tickets_paid: "Bilety płatne i kody rabatowe",
  badges: "Identyfikatory PDF",
  gamification: "Grywalizacja",
  gamification_rewards: "Nagrody i loteria",
  business_mixer: "Business Mixer",
  live_qa: "Q&A, ankiety i oceny sesji",
  photo_gallery: "Galeria zdjęć",
  ai_support: "Wsparcie AI",
  custom_domain: "Własna domena",
  white_label: "White-label",
  sso: "SSO",
  api: "API",
  multi_edition: "Serie i wiele edycji",
};

export type PlanRow = {
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  features: Partial<Record<string, boolean>> | null;
  limits: Partial<Record<string, number | null>> | null;
};

export type SubscriptionRow = {
  plan_key: string;
  status: string;
};

export type OverrideRow = {
  plan_key: string | null;
  features: Partial<Record<string, boolean>> | null;
  limits: Partial<Record<string, number | null>> | null;
  expires_at: string | null;
};

export type EntitlementSource =
  | "billing_disabled"
  | "override"
  | "subscription"
  | "default";

export type Entitlements = {
  billingEnabled: boolean;
  planKey: string | null;
  planName: string | null;
  source: EntitlementSource;
  features: Record<FeatureKey, boolean>;
  /** null = bez limitu */
  limits: Record<LimitKey, number | null>;
};

/** Plan przypisywany, gdy organizacja nie ma ważnej subskrypcji ani override'u. */
export const DEFAULT_PLAN_KEY = "free";

/** Statusy subskrypcji, przy których plan obowiązuje (past_due = okres łaski). */
const ENTITLED_STATUSES = new Set(["trialing", "active", "past_due"]);

function allFeatures(value: boolean): Record<FeatureKey, boolean> {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, value])) as Record<
    FeatureKey,
    boolean
  >;
}

function unlimited(): Record<LimitKey, number | null> {
  return Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])) as Record<
    LimitKey,
    number | null
  >;
}

function pickFeatures(
  source: Partial<Record<string, boolean>> | null | undefined,
): Partial<Record<FeatureKey, boolean>> {
  const out: Partial<Record<FeatureKey, boolean>> = {};
  for (const key of FEATURE_KEYS) {
    const v = source?.[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

function pickLimits(
  source: Partial<Record<string, number | null>> | null | undefined,
): Partial<Record<LimitKey, number | null>> {
  const out: Partial<Record<LimitKey, number | null>> = {};
  for (const key of LIMIT_KEYS) {
    if (!source || !(key in source)) continue;
    const v = source[key];
    if (v === null || (typeof v === "number" && Number.isFinite(v))) out[key] = v;
  }
  return out;
}

export function computeEntitlements(
  input:
    | { billingEnabled: false }
    | {
        billingEnabled: true;
        plans: PlanRow[];
        subscription: SubscriptionRow | null;
        override: OverrideRow | null;
        now: Date;
      },
): Entitlements {
  if (!input.billingEnabled) {
    return {
      billingEnabled: false,
      planKey: null,
      planName: null,
      source: "billing_disabled",
      features: allFeatures(true),
      limits: unlimited(),
    };
  }

  const { plans, subscription, now } = input;
  const override =
    input.override &&
    (!input.override.expires_at || new Date(input.override.expires_at) > now)
      ? input.override
      : null;

  const findPlan = (key: string | null | undefined) =>
    key ? plans.find((p) => p.key === key) : undefined;

  let source: EntitlementSource = "default";
  let plan = findPlan(DEFAULT_PLAN_KEY);
  if (override?.plan_key && findPlan(override.plan_key)) {
    plan = findPlan(override.plan_key);
    source = "override";
  } else if (
    subscription &&
    ENTITLED_STATUSES.has(subscription.status) &&
    findPlan(subscription.plan_key)
  ) {
    plan = findPlan(subscription.plan_key);
    source = "subscription";
  } else if (override) {
    // Override bez planu (same punktowe wyjątki) na planie domyślnym.
    source = "override";
  }

  // Brak planu domyślnego w bazie = błędna konfiguracja — nie odcinamy nikogo.
  if (!plan) {
    return computeEntitlements({ billingEnabled: false });
  }

  return {
    billingEnabled: true,
    planKey: plan.key,
    planName: plan.name,
    source,
    features: {
      ...allFeatures(false),
      ...pickFeatures(plan.features),
      ...pickFeatures(override?.features),
    },
    limits: {
      ...unlimited(),
      ...pickLimits(plan.limits),
      ...pickLimits(override?.limits),
    },
  };
}

/** Nazwa najtańszego aktywnego planu z daną funkcją (do komunikatu „dostępne w planie X"). */
export function minPlanForFeature(
  plans: PlanRow[],
  feature: FeatureKey,
): string | null {
  const plan = [...plans]
    .filter((p) => p.is_active && p.features?.[feature] === true)
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  return plan?.name ?? null;
}
