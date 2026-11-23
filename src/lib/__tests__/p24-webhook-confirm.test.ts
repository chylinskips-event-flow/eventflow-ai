import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutDbMock } from "./helpers/checkout-db-mock";

// Webhook P24 po pozytywnej weryfikacji: potwierdzenie zamówienia przez confirm_paid_order (pula,
// licznik kodu), bilet z danymi z formularza, a przy braku miejsc — bez biletu i z powiadomieniem.

const db = createCheckoutDbMock();
const sent = { confirmation: [] as unknown[], overbooked: [] as { to: string; info: Record<string, unknown> }[] };
let order: Record<string, unknown>;

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/p24", () => ({
  getPaymentConfig: async () => ({ crc: "crc" }),
  computeNotifySign: () => "sig",
  verifyTransaction: async () => ({ ok: true, data: { status: "success" } }),
}));
vi.mock("@/lib/email/attendee-confirmation", () => ({
  sendAttendeeConfirmationEmail: async (p: unknown) => void sent.confirmation.push(p),
}));
vi.mock("@/lib/booth-requests", () => ({ getOrganizerEmail: async () => "org@example.com" }));
vi.mock("@/lib/email/order-overbooked", () => ({
  sendOrderOverbookedEmail: async (to: string, info: Record<string, unknown>) => void sent.overbooked.push({ to, info }),
}));

const webhook = await import("@/app/api/p24/webhook/route");

const notify = () =>
  webhook.POST(
    new Request("https://eventro.pl/api/p24/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId: "p24_s1", sign: "sig", amount: 4000, orderId: 77, merchantId: 1, posId: 1, originAmount: 4000, currency: "PLN", methodId: 1, statement: "x" }),
    }) as never,
  );

beforeEach(() => {
  db.reset();
  sent.confirmation = [];
  sent.overbooked = [];
  order = {
    id: "o1",
    event_id: "ev1",
    status: "pending",
    total_amount: 4000,
    currency: "PLN",
    buyer_name: "Anna Maria Kowalska-Nowak",
    buyer_first_name: "Anna Maria",
    buyer_last_name: "Kowalska-Nowak",
    buyer_email: "anna@example.com",
    marketing_consent: true,
    p24_session_id: "p24_s1",
    created_at: "2026-11-20T10:00:00.000Z",
  };
  db.results["orders:select"] = () => ({ data: order, error: null });
  db.results["events:select"] = () => ({ data: { id: "ev1", name: "Konf", slug: "konf", organization_id: "org1" }, error: null });
  db.results["order_items:select"] = () => ({ data: [{ ticket_type_id: "tt1", quantity: 1 }], error: null });
  db.rpcResults.confirm_paid_order = () => ({ data: "paid", error: null });
});

describe("webhook P24: potwierdzona płatność", () => {
  it("bilet z imieniem, nazwiskiem i zgodą marketingową z formularza", async () => {
    const res = await notify();
    expect(res.status).toBe(200);
    expect(db.rpcCalls).toEqual([{ fn: "confirm_paid_order", args: { p_order_id: "o1", p_p24_order_id: "77" } }]);
    const [attendee] = db.inserts("attendees");
    expect(attendee).toMatchObject({
      first_name: "Anna Maria",
      last_name: "Kowalska-Nowak",
      marketing_consent: true,
      gdpr_consent_at: "2026-11-20T10:00:00.000Z",
      status: "approved",
    });
    expect(db.inserts("tickets")).toHaveLength(1);
    // Zamówienie oznacza jako opłacone funkcja SQL, nie bezpośredni UPDATE.
    expect(db.calls.filter((c) => c.table === "orders" && c.op === "update")).toHaveLength(0);
    expect(sent.confirmation).toHaveLength(1);
  });

  it("starsze zamówienie bez osobnych pól: imię to pierwszy wyraz, reszta to nazwisko", async () => {
    order.buyer_first_name = null;
    order.buyer_last_name = null;
    order.marketing_consent = false;
    await notify();
    expect(db.inserts("attendees")[0]).toMatchObject({
      first_name: "Anna",
      last_name: "Maria Kowalska-Nowak",
      marketing_consent: false,
    });
  });

  it("płatność po wygaśnięciu rezerwacji, pula wyczerpana: bez biletu, powiadomienie organizatora", async () => {
    db.rpcResults.confirm_paid_order = () => ({ data: "paid_overbooked", error: null });
    const res = await notify();
    expect(res.status).toBe(200);
    expect(db.inserts("attendees")).toHaveLength(0);
    expect(db.inserts("tickets")).toHaveLength(0);
    expect(sent.confirmation).toHaveLength(0);
    expect(sent.overbooked).toEqual([
      {
        to: "org@example.com",
        info: expect.objectContaining({ buyerEmail: "anna@example.com", amount: 4000, p24OrderId: "77", sessionId: "p24_s1" }),
      },
    ]);
  });

  it("zamówienie anulowane po upływie rezerwacji nie jest pomijane: idzie do potwierdzenia", async () => {
    order.status = "cancelled";
    await notify();
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["confirm_paid_order"]);
    expect(db.inserts("tickets")).toHaveLength(1);
  });

  it("zamówienie już opłacone: bez ponownego wystawienia", async () => {
    order.status = "paid";
    const res = await notify();
    expect(res.status).toBe(200);
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.inserts("attendees")).toHaveLength(0);
  });

  it("równoległe powiadomienie już rozliczyło zamówienie (noop): bez biletu", async () => {
    db.rpcResults.confirm_paid_order = () => ({ data: "noop", error: null });
    await notify();
    expect(db.inserts("attendees")).toHaveLength(0);
  });

  it("błąd zapisu potwierdzenia: 500, żeby P24 ponowiło", async () => {
    db.rpcResults.confirm_paid_order = () => ({ data: null, error: { message: "boom" } });
    const res = await notify();
    expect(res.status).toBe(500);
    expect(db.inserts("attendees")).toHaveLength(0);
  });
});
