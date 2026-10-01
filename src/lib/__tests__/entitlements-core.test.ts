import { describe, it, expect } from "vitest";
import {
  FEATURE_KEYS,
  computeEntitlements,
  minPlanForFeature,
  type PlanRow,
} from "../entitlements-core";

const plans: PlanRow[] = [
  {
    key: "free",
    name: "Free",
    sort_order: 0,
    is_active: true,
    features: { registration: true, badges: false, business_mixer: false },
    limits: { max_attendees_per_event: 75, max_events: 2, ticket_commission_pct: 4 },
  },
  {
    key: "pro",
    name: "Pro",
    sort_order: 10,
    is_active: true,
    features: { registration: true, badges: true, business_mixer: false },
    limits: { max_attendees_per_event: 300, max_events: null, ticket_commission_pct: 2.5 },
  },
  {
    key: "business",
    name: "Business",
    sort_order: 20,
    is_active: true,
    features: { registration: true, badges: true, business_mixer: true },
    limits: { max_attendees_per_event: null, ticket_commission_pct: 1.5 },
  },
];

const now = new Date("2026-10-01T12:00:00Z");

describe("computeEntitlements", () => {
  it("billing wyłączony → wszystko dostępne, bez limitów", () => {
    const e = computeEntitlements({ billingEnabled: false });
    expect(e.source).toBe("billing_disabled");
    for (const key of FEATURE_KEYS) expect(e.features[key]).toBe(true);
    expect(e.limits).toEqual({
      max_attendees_per_event: null,
      max_events: null,
      ticket_commission_pct: null,
    });
  });

  it("brak subskrypcji → plan Free; nieznane funkcje = false", () => {
    const e = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: null,
      override: null,
      now,
    });
    expect(e.planKey).toBe("free");
    expect(e.source).toBe("default");
    expect(e.features.registration).toBe(true);
    expect(e.features.badges).toBe(false);
    expect(e.features.gamification).toBe(false); // brak klucza w planie
    expect(e.limits.max_attendees_per_event).toBe(75);
  });

  it("aktywna subskrypcja → plan z subskrypcji; brak klucza limitu = bez limitu", () => {
    const e = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: { plan_key: "business", status: "active" },
      override: null,
      now,
    });
    expect(e.planKey).toBe("business");
    expect(e.features.business_mixer).toBe(true);
    expect(e.limits.max_attendees_per_event).toBeNull();
    expect(e.limits.max_events).toBeNull();
  });

  it("past_due zachowuje plan, canceled wraca do Free", () => {
    const pastDue = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: { plan_key: "pro", status: "past_due" },
      override: null,
      now,
    });
    expect(pastDue.planKey).toBe("pro");

    const canceled = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: { plan_key: "pro", status: "canceled" },
      override: null,
      now,
    });
    expect(canceled.planKey).toBe("free");
  });

  it("override planu (grandfathering) wygrywa z subskrypcją", () => {
    const e = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: { plan_key: "pro", status: "active" },
      override: { plan_key: "business", features: null, limits: null, expires_at: null },
      now,
    });
    expect(e.planKey).toBe("business");
    expect(e.source).toBe("override");
  });

  it("punktowe override'y funkcji i limitów nakładają się na plan", () => {
    const e = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: { plan_key: "pro", status: "active" },
      override: {
        plan_key: null,
        features: { business_mixer: true, unknown_key: true },
        limits: { ticket_commission_pct: 0, max_events: 3 },
        expires_at: null,
      },
      now,
    });
    expect(e.planKey).toBe("pro");
    expect(e.features.business_mixer).toBe(true);
    expect(e.limits.ticket_commission_pct).toBe(0);
    expect(e.limits.max_events).toBe(3);
    expect(e.limits.max_attendees_per_event).toBe(300);
  });

  it("wygasły override jest ignorowany", () => {
    const e = computeEntitlements({
      billingEnabled: true,
      plans,
      subscription: null,
      override: {
        plan_key: "business",
        features: null,
        limits: null,
        expires_at: "2026-09-01T00:00:00Z",
      },
      now,
    });
    expect(e.planKey).toBe("free");
    expect(e.source).toBe("default");
  });

  it("brak planu domyślnego w bazie → pełny dostęp (nie odcinamy)", () => {
    const e = computeEntitlements({
      billingEnabled: true,
      plans: [],
      subscription: null,
      override: null,
      now,
    });
    expect(e.source).toBe("billing_disabled");
    expect(e.features.business_mixer).toBe(true);
  });
});

describe("minPlanForFeature", () => {
  it("zwraca najtańszy aktywny plan z funkcją", () => {
    expect(minPlanForFeature(plans, "badges")).toBe("Pro");
    expect(minPlanForFeature(plans, "business_mixer")).toBe("Business");
    expect(minPlanForFeature(plans, "sso")).toBeNull();
  });
});
