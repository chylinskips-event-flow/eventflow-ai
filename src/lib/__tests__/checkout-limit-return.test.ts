import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCheckoutDbMock } from "./helpers/checkout-db-mock";

// Limit uczestników przy płatnym zakupie (ponowne sprawdzenie przy potwierdzeniu płatności)
// oraz powrót z płatności: logowanie jako uczestnik tylko w przeglądarce, która rozpoczęła zakup.

const db = createCheckoutDbMock();
const limit = { reached: false };
const sent = { overbooked: [] as Record<string, unknown>[], confirmation: 0 };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/p24", () => ({
  getPaymentConfig: async () => ({ crc: "crc" }),
  computeNotifySign: () => "sig",
  verifyTransaction: async () => ({ ok: true, data: { status: "success" } }),
}));
vi.mock("@/lib/entitlements", () => ({ isAttendeeLimitReached: async () => limit.reached }));
vi.mock("@/lib/email/attendee-confirmation", () => ({
  sendAttendeeConfirmationEmail: async () => void sent.confirmation++,
}));
vi.mock("@/lib/booth-requests", () => ({ getOrganizerEmail: async () => "org@example.com" }));
vi.mock("@/lib/email/order-overbooked", () => ({
  sendOrderOverbookedEmail: async (_to: string, info: Record<string, unknown>) => void sent.overbooked.push(info),
}));

const webhook = await import("@/app/api/p24/webhook/route");
const panel = await import("@/app/(participant)/e/[slug]/checkout/return/panel/route");
const { isOwnCheckoutSession, CHECKOUT_SESSION_COOKIE } = await import("@/lib/checkout-return");
const { attendeeLimitExceeded } = await vi.importActual<typeof import("@/lib/entitlements")>(
  "@/lib/entitlements",
);

const notify = () =>
  webhook.POST(
    new Request("https://eventro.pl/api/p24/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId: "p24_s1", sign: "sig", amount: 4000, orderId: 77, merchantId: 1, posId: 1, originAmount: 4000, currency: "PLN", methodId: 1, statement: "x" }),
    }) as never,
  );

beforeEach(() => {
  db.reset();
  limit.reached = false;
  sent.overbooked = [];
  sent.confirmation = 0;
  db.results["orders:select"] = () => ({
    data: {
      id: "o1",
      event_id: "ev1",
      status: "pending",
      total_amount: 4000,
      currency: "PLN",
      buyer_name: "Anna Nowak",
      buyer_first_name: "Anna",
      buyer_last_name: "Nowak",
      buyer_email: "anna@example.com",
      marketing_consent: false,
      p24_session_id: "p24_s1",
      created_at: "2026-11-20T10:00:00.000Z",
    },
    error: null,
  });
  db.results["events:select"] = () => ({ data: { id: "ev1", name: "Konf", slug: "konf", organization_id: "org1" }, error: null });
  db.results["order_items:select"] = () => ({ data: [{ ticket_type_id: "tt1", quantity: 1 }], error: null });
  db.rpcResults.confirm_paid_order = () => ({ data: "paid", error: null });
  db.rpcResults.mark_order_overbooked = () => ({ data: "paid_overbooked", error: null });
});

describe("limit uczestników: liczenie trwających płatności", () => {
  it("uczestnicy + oczekujące zamówienia wyczerpują limit", () => {
    expect(attendeeLimitExceeded(300, 299, 0)).toBe(false);
    expect(attendeeLimitExceeded(300, 299, 1)).toBe(true);
    expect(attendeeLimitExceeded(300, 300)).toBe(true);
    expect(attendeeLimitExceeded(null, 10_000, 50)).toBe(false);
  });
});

describe("webhook P24: limit uczestników przy potwierdzeniu", () => {
  it("limit nieosiągnięty: zwykłe potwierdzenie i bilet", async () => {
    await notify();
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["confirm_paid_order"]);
    expect(db.inserts("tickets")).toHaveLength(1);
  });

  it("limit osiągnięty: zamówienie bez biletu, powiadomienie organizatora z przyczyną", async () => {
    limit.reached = true;
    const res = await notify();
    expect(res.status).toBe(200);
    expect(db.rpcCalls).toEqual([{ fn: "mark_order_overbooked", args: { p_order_id: "o1", p_p24_order_id: "77" } }]);
    expect(db.inserts("attendees")).toHaveLength(0);
    expect(db.inserts("tickets")).toHaveLength(0);
    expect(sent.confirmation).toBe(0);
    expect(sent.overbooked).toEqual([expect.objectContaining({ reason: "attendee_limit", p24OrderId: "77" })]);
  });

  it("limit osiągnięty, ale zamówienie już rozliczone (noop): bez powiadomienia", async () => {
    limit.reached = true;
    db.rpcResults.mark_order_overbooked = () => ({ data: "noop", error: null });
    await notify();
    expect(sent.overbooked).toHaveLength(0);
    expect(db.inserts("tickets")).toHaveLength(0);
  });

  it("błąd zapisu przy limicie: 500, żeby P24 ponowiło", async () => {
    limit.reached = true;
    db.rpcResults.mark_order_overbooked = () => ({ data: null, error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await notify();
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe("powrót z płatności: panel uczestnika", () => {
  function request(sessionId: string, cookie?: string) {
    const headers = new Headers({ host: "eventro.pl", "x-forwarded-proto": "https" });
    if (cookie !== undefined) headers.set("cookie", `${CHECKOUT_SESSION_COOKIE}=${cookie}`);
    return new NextRequest(`https://eventro.pl/e/konf/checkout/return/panel?sessionId=${sessionId}`, { headers });
  }
  const call = (req: unknown) => panel.GET(req as never, { params: Promise.resolve({ slug: "konf" }) });

  beforeEach(() => {
    db.results["orders:select"] = () => ({ data: { id: "o1", event_id: "ev1", status: "paid" }, error: null });
    db.results["tickets:select"] = () => ({ data: { attendee_id: "att1" }, error: null });
    db.results["attendees:select"] = () => ({ data: { qr_code_token: "qr-1", status: "approved" }, error: null });
  });

  it("identyfikator sesji musi zgadzać się z ciasteczkiem z rozpoczęcia zakupu", () => {
    expect(isOwnCheckoutSession("p24_a", "p24_a")).toBe(true);
    expect(isOwnCheckoutSession("p24_a", "p24_b")).toBe(false);
    expect(isOwnCheckoutSession(undefined, "p24_a")).toBe(false);
    expect(isOwnCheckoutSession("", "")).toBe(false);
  });

  it("ta sama przeglądarka i opłacone zamówienie: ciasteczko uczestnika i strona wydarzenia", async () => {
    const res = await call(request("p24_s1", "p24_s1"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/e/konf");
    expect(res.cookies.get("eventflow_attendee_token")?.value).toBe("qr-1");
    const orderQuery = db.calls.find((c) => c.table === "orders");
    expect(orderQuery?.filters).toContainEqual(["eq:p24_session_id", "p24_s1"]);
    expect(orderQuery?.filters).toContainEqual(["eq:events.slug", "konf"]);
  });

  it("bez ciasteczka (link z innej przeglądarki): tylko przekierowanie, bez logowania", async () => {
    const res = await call(request("p24_s1"));
    expect(res.cookies.get("eventflow_attendee_token")).toBeUndefined();
    expect(db.calls).toHaveLength(0);
  });

  it("ciasteczko innej sesji: bez logowania", async () => {
    const res = await call(request("p24_s1", "p24_inna"));
    expect(res.cookies.get("eventflow_attendee_token")).toBeUndefined();
  });

  it("zamówienie nieopłacone albo uczestnik niezatwierdzony: bez logowania", async () => {
    db.results["orders:select"] = () => ({ data: { id: "o1", event_id: "ev1", status: "pending" }, error: null });
    expect((await call(request("p24_s1", "p24_s1"))).cookies.get("eventflow_attendee_token")).toBeUndefined();

    db.results["orders:select"] = () => ({ data: { id: "o1", event_id: "ev1", status: "paid" }, error: null });
    db.results["attendees:select"] = () => ({ data: { qr_code_token: "qr-1", status: "pending" }, error: null });
    expect((await call(request("p24_s1", "p24_s1"))).cookies.get("eventflow_attendee_token")).toBeUndefined();
  });
});
