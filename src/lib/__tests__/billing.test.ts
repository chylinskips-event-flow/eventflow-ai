import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Atrapa Stripe ──────────────────────────────────────────────────────────
const stripeSubscriptions = new Map<string, unknown>();
vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      retrieve: async (id: string) => {
        const sub = stripeSubscriptions.get(id);
        if (!sub) throw new Error("No such subscription");
        return sub;
      },
    };
  },
}));

// ── Atrapa Supabase (service role) ─────────────────────────────────────────
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const touchedTables = new Set<string>();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      touchedTables.add(table);
      const filters: [string, unknown][] = [];
      const rows = () =>
        (db[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve),
        upsert: (row: Row) => {
          const list = (db[table] ??= []);
          const i = list.findIndex((r) => r.organization_id === row.organization_id);
          if (i >= 0) list[i] = { ...list[i], ...row };
          else list.push(row);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  }),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_PRICE_PRO = "price_pro";
process.env.STRIPE_PRICE_BUSINESS = "price_business";

const { syncSubscription } = await import("../billing");

function stripeSub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    metadata: { organization_id: "org_1" },
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      data: [
        {
          price: { id: "price_pro" },
          current_period_start: 1_790_000_000,
          current_period_end: 1_792_592_000,
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  stripeSubscriptions.clear();
  touchedTables.clear();
  db.billing_customers = [{ organization_id: "org_1", stripe_customer_id: "cus_1" }];
  db.plans = [
    { key: "pro", stripe_price_id: null, stripe_price_yearly_id: null },
    { key: "business", stripe_price_id: null, stripe_price_yearly_id: null },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncSubscription", () => {
  it("aktywna subskrypcja Pro → wiersz subscriptions z planem i okresem", async () => {
    stripeSubscriptions.set("sub_1", stripeSub());
    const result = await syncSubscription("sub_1");
    expect(result).toMatchObject({ outcome: "updated", planKey: "pro", status: "active" });
    expect(db.subscriptions[0]).toMatchObject({
      organization_id: "org_1",
      plan_key: "pro",
      status: "active",
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      stripe_price_id: "price_pro",
      current_period_end: new Date(1_792_592_000 * 1000).toISOString(),
    });
  });

  it("zmiana planu w Portalu (nowa cena) → nowy plan; powtórka nic nie psuje", async () => {
    stripeSubscriptions.set("sub_1", stripeSub());
    await syncSubscription("sub_1");
    stripeSubscriptions.set(
      "sub_1",
      stripeSub({ items: { data: [{ price: { id: "price_business" }, current_period_end: 1 }] } }),
    );
    await syncSubscription("sub_1");
    await syncSubscription("sub_1");
    expect(db.subscriptions).toHaveLength(1);
    expect(db.subscriptions[0]).toMatchObject({ plan_key: "business" });
  });

  it("anulowanie → status canceled (entitlements wracają do Free)", async () => {
    stripeSubscriptions.set("sub_1", stripeSub({ status: "canceled" }));
    await syncSubscription("sub_1");
    expect(db.subscriptions[0]).toMatchObject({ status: "canceled" });
  });

  it("nieznana cena → plan bez zmian", async () => {
    stripeSubscriptions.set(
      "sub_1",
      stripeSub({ items: { data: [{ price: { id: "price_hacked" } }] } }),
    );
    expect(await syncSubscription("sub_1")).toMatchObject({ outcome: "skipped" });
    expect(db.subscriptions).toBeUndefined();
  });

  it("nieznany klient Stripe → pominięte", async () => {
    stripeSubscriptions.set("sub_1", stripeSub({ customer: "cus_other" }));
    expect(await syncSubscription("sub_1")).toMatchObject({ outcome: "skipped" });
  });

  it("metadata wskazuje inną organizację niż klient → pominięte", async () => {
    stripeSubscriptions.set("sub_1", stripeSub({ metadata: { organization_id: "org_evil" } }));
    expect(await syncSubscription("sub_1")).toMatchObject({ outcome: "skipped" });
  });

  it("nigdy nie dotyka entitlement_overrides (grandfathering wygrywa)", async () => {
    stripeSubscriptions.set("sub_1", stripeSub({ status: "canceled" }));
    await syncSubscription("sub_1");
    expect(touchedTables.has("entitlement_overrides")).toBe(false);
  });
});
