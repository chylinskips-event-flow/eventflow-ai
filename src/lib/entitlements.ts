import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  LIMIT_KEYS,
  computeEntitlements,
  minPlanForFeature,
  type Entitlements,
  type FeatureKey,
  type LimitKey,
  type OverrideRow,
  type PlanRow,
  type SubscriptionRow,
} from "@/lib/entitlements-core";
import { PENDING_ORDER_TTL_MINUTES } from "@/lib/checkout-core";

export {
  FEATURE_KEYS,
  FEATURE_LABELS,
  LIMIT_KEYS,
  type Entitlements,
  type FeatureKey,
  type LimitKey,
};

/**
 * Master flag monetyzacji. Dopóki nie jest ustawiona na "true", wszyscy organizatorzy
 * mają pełny dostęp bez limitów (pilotaż), a baza planów nie jest w ogóle czytana.
 */
export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
}

export type GateResult = { ok: true } | { ok: false; message: string };

const getActivePlans = cache(async (): Promise<PlanRow[] | null> => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plans")
    .select("key, name, sort_order, is_active, features, limits")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[entitlements] plans read failed:", error.message);
    return null;
  }
  return (data ?? []) as PlanRow[];
});

/**
 * Uprawnienia organizacji — jedno źródło prawdy, liczone wyłącznie serwerowo.
 * Cache'owane na czas jednego requestu.
 */
export const getEntitlements = cache(
  async (organizationId: string): Promise<Entitlements> => {
    if (!isBillingEnabled()) {
      return computeEntitlements({ billingEnabled: false });
    }

    const admin = createAdminClient();
    const [plans, subscriptionRes, overrideRes] = await Promise.all([
      getActivePlans(),
      admin
        .from("subscriptions")
        .select("plan_key, status")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("entitlement_overrides")
        .select("plan_key, features, limits, expires_at")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    // Brak dostępu do tabel (np. migracja niezastosowana) — nie odcinamy organizatora.
    if (!plans || subscriptionRes.error || overrideRes.error) {
      console.error(
        "[entitlements] read failed — falling back to full access",
        subscriptionRes.error?.message ?? overrideRes.error?.message ?? "plans",
      );
      return computeEntitlements({ billingEnabled: false });
    }

    return computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: subscriptionRes.data as SubscriptionRow | null,
      override: overrideRes.data as OverrideRow | null,
      now: new Date(),
    });
  },
);

export async function hasFeature(
  organizationId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const entitlements = await getEntitlements(organizationId);
  return entitlements.features[feature];
}

/** Limit dla organizacji; `null` = bez limitu. */
export async function getLimit(
  organizationId: string,
  limit: LimitKey,
): Promise<number | null> {
  const entitlements = await getEntitlements(organizationId);
  return entitlements.limits[limit];
}

/** Prowizja od biletów płatnych w %. Przy wyłączonym billingu (pilotaż) zawsze 0. */
export async function getTicketCommissionPct(
  organizationId: string,
): Promise<number> {
  return (await getLimit(organizationId, "ticket_commission_pct")) ?? 0;
}

/** Komunikat „dostępne w planie X" dla funkcji spoza planu. */
export async function upgradeMessage(feature: FeatureKey): Promise<string> {
  const plans = isBillingEnabled() ? await getActivePlans() : null;
  const planName = plans ? minPlanForFeature(plans, feature) : null;
  const label = FEATURE_LABELS[feature];
  return planName
    ? `${label} — dostępne w planie ${planName} i wyższych.`
    : `${label} — niedostępne w Twoim planie.`;
}

/** Miękka bramka funkcji: `{ ok: false, message }` zamiast wyjątku. */
export async function featureGate(
  organizationId: string,
  feature: FeatureKey,
): Promise<GateResult> {
  if (await hasFeature(organizationId, feature)) return { ok: true };
  return { ok: false, message: await upgradeMessage(feature) };
}

/**
 * Czy można dodać jeszcze `adding` sztuk przy obecnym stanie `current`.
 * Zwraca też limit, żeby wywołujący mógł zbudować własny komunikat.
 */
export async function checkLimit(
  organizationId: string,
  limit: LimitKey,
  current: number,
  adding = 1,
): Promise<{ ok: boolean; limit: number | null }> {
  const value = await getLimit(organizationId, limit);
  return { ok: value == null || current + adding <= value, limit: value };
}

/** Komunikat dla uczestnika — bez wspominania o planach organizatora. */
export const ATTENDEE_LIMIT_MESSAGE =
  "Rejestracja zamknięta — osiągnięto limit miejsc na to wydarzenie.";

/** Czy zajęte miejsca (uczestnicy + trwające płatności) wyczerpują limit; `null` = bez limitu. */
export function attendeeLimitExceeded(
  limit: number | null,
  attendees: number,
  activePendingOrders = 0,
): boolean {
  if (limit == null) return false;
  return attendees + Math.max(0, activePendingOrders) >= limit;
}

/**
 * Czy event osiągnął limit uczestników z planu organizatora (odrzuceni się nie liczą).
 * `includePendingOrders`: wliczaj też trwające płatności (zamówienia oczekujące młodsze niż czas
 * rezerwacji) — każda z nich po opłaceniu doda uczestnika, więc kasa nie może ich pominąć.
 * Przy wyłączonym billingu nie wykonuje żadnego zapytania.
 */
export async function isAttendeeLimitReached(
  event: {
    id: string;
    organization_id: string;
  },
  options: { includePendingOrders?: boolean } = {},
): Promise<boolean> {
  const limit = await getLimit(event.organization_id, "max_attendees_per_event");
  if (limit == null) return false;
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("attendees")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .neq("status", "rejected");
  if (error) {
    console.error("[entitlements] attendee count failed:", error.message);
    return false;
  }

  let pending = 0;
  if (options.includePendingOrders) {
    const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MINUTES * 60 * 1000).toISOString();
    const { count: pendingCount, error: pendingError } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "pending")
      .gte("created_at", cutoff);
    if (pendingError) {
      console.error("[entitlements] pending order count failed:", pendingError.message);
    } else {
      pending = pendingCount ?? 0;
    }
  }

  return attendeeLimitExceeded(limit, count ?? 0, pending);
}
