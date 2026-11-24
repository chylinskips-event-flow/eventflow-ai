import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkoutIdempotencyKey,
  hasBlockingStripeSubscription,
  planOpenCheckoutSessions,
  type CheckoutSessionLike,
} from "../billing-core";

// ── Atrapa Stripe ──────────────────────────────────────────────────────────
type Sess = CheckoutSessionLike & { customer: string };
const stripeState = {
  subscriptions: [] as { id: string; status: string; customer: string }[],
  sessions: [] as Sess[],
  created: [] as { params: Record<string, unknown>; key?: string }[],
  expired: [] as string[],
  idempotent: new Map<string, Sess>(),
  seq: 0,
};

vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      list: async (p: { customer: string }) => ({
        data: stripeState.subscriptions.filter((s) => s.customer === p.customer),
      }),
    };
    checkout = {
      sessions: {
        list: async (p: { customer: string; status: string }) => ({
          data: stripeState.sessions.filter(
            (s) => s.customer === p.customer && s.status === p.status,
          ),
        }),
        expire: async (id: string) => {
          stripeState.expired.push(id);
          const s = stripeState.sessions.find((x) => x.id === id);
          if (s) s.status = "expired";
          return s;
        },
        create: async (
          params: Record<string, unknown>,
          opts?: { idempotencyKey?: string },
        ) => {
          const key = opts?.idempotencyKey;
          if (key && stripeState.idempotent.has(key)) return stripeState.idempotent.get(key);
          stripeState.created.push({ params, key });
          const id = `cs_${++stripeState.seq}`;
          const s: Sess = {
            id,
            customer: params.customer as string,
            status: "open",
            url: `https://checkout.stripe.test/${id}`,
            expires_at: Math.floor(Date.now() / 1000) + 24 * 3600,
            metadata: params.metadata as Record<string, string>,
          };
          stripeState.sessions.push(s);
          if (key) stripeState.idempotent.set(key, s);
          return s;
        },
      },
    };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";

const { createSubscriptionCheckout } = await import("../billing");

const input = {
  organizationId: "org_1",
  customerId: "cus_1",
  planKey: "pro",
  priceId: "price_pro",
  trialDays: 14,
  successUrl: "https://app.test/admin/billing?checkout=success",
  cancelUrl: "https://app.test/admin/billing?checkout=cancel",
};

beforeEach(() => {
  stripeState.subscriptions = [];
  stripeState.sessions = [];
  stripeState.created = [];
  stripeState.expired = [];
  stripeState.idempotent.clear();
  stripeState.seq = 0;
});

describe("hasBlockingStripeSubscription", () => {
  it("blokuje przy subskrypcji żywej, nieopłaconej lub wstrzymanej", () => {
    for (const status of ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]) {
      expect(hasBlockingStripeSubscription([{ status }])).toBe(true);
    }
  });

  it("nie blokuje po anulowaniu lub wygaśnięciu", () => {
    expect(
      hasBlockingStripeSubscription([{ status: "canceled" }, { status: "incomplete_expired" }]),
    ).toBe(false);
    expect(hasBlockingStripeSubscription([])).toBe(false);
  });
});

describe("planOpenCheckoutSessions", () => {
  const now = 1_800_000_000;
  const sess = (o: Partial<CheckoutSessionLike>): CheckoutSessionLike => ({
    id: "cs",
    status: "open",
    url: "https://x",
    expires_at: now + 3600,
    metadata: { organization_id: "org_1", price_id: "price_pro" },
    ...o,
  });
  const target = { organizationId: "org_1", priceId: "price_pro", nowS: now };

  it("ponownie używa otwartej sesji z tą samą ceną", () => {
    const r = planOpenCheckoutSessions([sess({ id: "a" })], target);
    expect(r.reuse?.id).toBe("a");
    expect(r.expire).toEqual([]);
  });

  it("wygasza sesje na inną cenę oraz nadmiarowe duplikaty", () => {
    const r = planOpenCheckoutSessions(
      [
        sess({ id: "a" }),
        sess({ id: "b" }),
        sess({ id: "c", metadata: { organization_id: "org_1", price_id: "price_biz" } }),
      ],
      target,
    );
    expect(r.reuse?.id).toBe("a");
    expect(r.expire).toEqual(["b", "c"]);
  });

  it("nie używa sesji bliskiej wygaśnięcia ani bez adresu (wygasza je)", () => {
    const r = planOpenCheckoutSessions(
      [sess({ id: "a", expires_at: now + 60 }), sess({ id: "b", url: null })],
      target,
    );
    expect(r.reuse).toBeNull();
    expect(r.expire).toEqual(["a", "b"]);
  });

  it("pomija sesje zamknięte i innej organizacji", () => {
    const r = planOpenCheckoutSessions(
      [
        sess({ id: "a", status: "complete" }),
        sess({ id: "b", metadata: { organization_id: "org_2", price_id: "price_pro" } }),
      ],
      target,
    );
    expect(r).toEqual({ reuse: null, expire: [] });
  });
});

describe("checkoutIdempotencyKey", () => {
  const base = { organizationId: "org_1", priceId: "price_pro", trialDays: 14 };
  it("ten sam w obrębie okna, różny dla innej ceny/organizacji/okna", () => {
    const t = 1_800_000_000_000;
    const k = checkoutIdempotencyKey({ ...base, nowMs: t, windowMs: 600_000 });
    expect(checkoutIdempotencyKey({ ...base, nowMs: t + 1000, windowMs: 600_000 })).toBe(k);
    expect(checkoutIdempotencyKey({ ...base, nowMs: t + 600_000, windowMs: 600_000 })).not.toBe(k);
    expect(
      checkoutIdempotencyKey({ ...base, priceId: "price_biz", nowMs: t, windowMs: 600_000 }),
    ).not.toBe(k);
    expect(
      checkoutIdempotencyKey({ ...base, organizationId: "org_2", nowMs: t, windowMs: 600_000 }),
    ).not.toBe(k);
  });
});

describe("createSubscriptionCheckout", () => {
  it("odmawia, gdy klient ma już subskrypcję w Stripe (webhook jeszcze nie dotarł)", async () => {
    stripeState.subscriptions = [{ id: "sub_1", status: "trialing", customer: "cus_1" }];
    const r = await createSubscriptionCheckout(input);
    expect(r).toEqual({ kind: "has_subscription" });
    expect(stripeState.created).toHaveLength(0);
  });

  it("dwa kolejne wywołania (dwie karty) dają tę samą sesję", async () => {
    const a = await createSubscriptionCheckout(input);
    const b = await createSubscriptionCheckout(input);
    expect(a.kind).toBe("redirect");
    expect(b).toEqual(a);
    expect(stripeState.created).toHaveLength(1);
    expect(stripeState.created[0].key).toMatch(/^eventro-checkout-org_1-price_pro-t14-/);
    expect(stripeState.created[0].params.metadata).toMatchObject({
      organization_id: "org_1",
      plan_key: "pro",
      price_id: "price_pro",
    });
  });

  it("równoległe wywołania sklejają się kluczem idempotencji", async () => {
    const [a, b] = await Promise.all([
      createSubscriptionCheckout(input),
      createSubscriptionCheckout(input),
    ]);
    expect(a).toEqual(b);
    expect(stripeState.created).toHaveLength(1);
  });

  it("zmiana planu wygasza poprzednią otwartą sesję", async () => {
    const a = await createSubscriptionCheckout(input);
    const b = await createSubscriptionCheckout({
      ...input,
      planKey: "business",
      priceId: "price_biz",
    });
    expect(b).not.toEqual(a);
    expect(stripeState.expired).toEqual(["cs_1"]);
    expect(stripeState.sessions.filter((s) => s.status === "open")).toHaveLength(1);
  });

  it("klucz z okna wskazujący wygaszoną sesję → nowa sesja", async () => {
    await createSubscriptionCheckout(input);
    await createSubscriptionCheckout({ ...input, planKey: "business", priceId: "price_biz" });
    // Powrót do pierwszego planu w tym samym oknie: stara sesja jest już wygaszona.
    const c = await createSubscriptionCheckout(input);
    expect(c.kind).toBe("redirect");
    const open = stripeState.sessions.filter((s) => s.status === "open");
    expect(open).toHaveLength(1);
    expect(c).toEqual({ kind: "redirect", url: open[0].url });
  });
});
