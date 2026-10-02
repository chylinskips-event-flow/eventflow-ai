import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

// ── Atrapy ─────────────────────────────────────────────────────────────────
const processed = new Set<string>();
const upserts: unknown[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "stripe_webhook_events") throw new Error(`unexpected table ${table}`);
      let id: string | null = null;
      const builder = {
        select: () => builder,
        eq: (_col: string, value: string) => ((id = value), builder),
        maybeSingle: () =>
          Promise.resolve({ data: id && processed.has(id) ? { id } : null, error: null }),
        upsert: (row: { id: string }) => {
          upserts.push(row);
          processed.add(row.id);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  }),
}));

const syncSubscription = vi.fn();
vi.mock("@/lib/billing", async () => {
  const StripeSdk = (await import("stripe")).default;
  return {
    isStripeConfigured: () => true,
    getStripe: () => new StripeSdk("sk_test_dummy"),
    syncSubscription: (id: string) => syncSubscription(id),
  };
});

const SECRET = "whsec_test_secret";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

const { POST } = await import("../route");

function signedRequest(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header },
    body: payload,
  });
}

function event(id: string, type: string, object: object) {
  return { id, object: "event", type, data: { object } };
}

beforeEach(() => {
  processed.clear();
  upserts.length = 0;
  syncSubscription.mockReset();
  syncSubscription.mockResolvedValue({ outcome: "updated" });
});

describe("POST /api/stripe/webhook", () => {
  it("odrzuca zły podpis (400) i nic nie synchronizuje", async () => {
    const res = await POST(
      signedRequest(event("evt_1", "customer.subscription.updated", { id: "sub_1" }), "whsec_wrong"),
    );
    expect(res.status).toBe(400);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("brak nagłówka podpisu → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(400);
  });

  it("subscription.updated → sync subskrypcji i zapis event.id", async () => {
    const res = await POST(
      signedRequest(event("evt_2", "customer.subscription.updated", { id: "sub_2" })),
    );
    expect(res.status).toBe(200);
    expect(syncSubscription).toHaveBeenCalledWith("sub_2");
    expect(upserts).toEqual([{ id: "evt_2", type: "customer.subscription.updated" }]);
  });

  it("checkout.session.completed (subscription) → sync po ID subskrypcji", async () => {
    await POST(
      signedRequest(
        event("evt_3", "checkout.session.completed", { mode: "subscription", subscription: "sub_3" }),
      ),
    );
    expect(syncSubscription).toHaveBeenCalledWith("sub_3");
  });

  it("invoice.payment_failed → sync po parent.subscription_details", async () => {
    await POST(
      signedRequest(
        event("evt_4", "invoice.payment_failed", {
          parent: { subscription_details: { subscription: "sub_4" } },
        }),
      ),
    );
    expect(syncSubscription).toHaveBeenCalledWith("sub_4");
  });

  it("idempotencja: powtórzone zdarzenie nie jest przetwarzane drugi raz", async () => {
    const e = event("evt_5", "customer.subscription.deleted", { id: "sub_5" });
    await POST(signedRequest(e));
    const res = await POST(signedRequest(e));
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(syncSubscription).toHaveBeenCalledTimes(1);
  });

  it("błąd przetwarzania → 500, zdarzenie nieoznaczone (Stripe ponowi)", async () => {
    syncSubscription.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const e = event("evt_6", "customer.subscription.updated", { id: "sub_6" });
    const first = await POST(signedRequest(e));
    expect(first.status).toBe(500);
    expect(processed.has("evt_6")).toBe(false);
    const retry = await POST(signedRequest(e));
    expect(retry.status).toBe(200);
    expect(syncSubscription).toHaveBeenCalledTimes(2);
  });

  it("nieobsługiwany typ zdarzenia → 200 bez akcji", async () => {
    const res = await POST(signedRequest(event("evt_7", "charge.refunded", {})));
    expect(res.status).toBe(200);
    expect(syncSubscription).not.toHaveBeenCalled();
  });
});
