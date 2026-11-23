import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutDbMock } from "./helpers/checkout-db-mock";

// Kasa biletowa: bilet darmowy przy wydarzeniu z zatwierdzaniem, rabat 100% bez bramki płatności,
// licznik kodu rabatowego dopiero po płatności, dane kupującego zapisane na zamówieniu.

const db = createCheckoutDbMock();
const mail = { confirmation: vi.fn(async () => {}), pending: vi.fn(async () => {}) };
const p24 = {
  getPaymentConfig: vi.fn(async () => ({ enabled: true, sandbox: true, crc: "c" }) as Record<string, unknown> | null),
  registerTransaction: vi.fn(async () => ({ ok: true, data: { token: "tok" } })),
};
const duplicate = { message: null as string | null };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/email/attendee-confirmation", () => ({
  sendAttendeeConfirmationEmail: (...a: unknown[]) => mail.confirmation(...(a as [])),
  sendAttendeePendingApprovalEmail: (...a: unknown[]) => mail.pending(...(a as [])),
}));
vi.mock("@/lib/entitlements", () => ({
  ATTENDEE_LIMIT_MESSAGE: "limit",
  hasFeature: async () => true,
  isAttendeeLimitReached: async () => false,
}));
vi.mock("@/lib/duplicate-registration", () => ({ handleDuplicateRegistration: async () => duplicate.message }));
vi.mock("@/lib/p24", () => ({
  getPaymentConfig: () => p24.getPaymentConfig(),
  registerTransaction: () => p24.registerTransaction(),
  getP24BaseUrl: () => "https://sandbox.przelewy24.pl",
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://eventro.pl" }),
  cookies: async () => ({ set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const { completeFreeCheckout, startPaidCheckout } = await import(
  "@/app/(participant)/e/[slug]/checkout/actions"
);

const baseEvent = {
  id: "ev1",
  slug: "konf",
  name: "Konf",
  organization_id: "org1",
  status: "published",
  registration_open: true,
  requires_approval: false,
};
let event: Record<string, unknown>;
let ticketType: Record<string, unknown>;
let discountCode: Record<string, unknown> | null;

beforeEach(() => {
  db.reset();
  mail.confirmation.mockClear();
  mail.pending.mockClear();
  p24.getPaymentConfig.mockClear();
  p24.registerTransaction.mockClear();
  duplicate.message = null;
  event = { ...baseEvent };
  ticketType = { id: "tt1", price: 0, quantity_total: 10, sales_start: null, sales_end: null };
  discountCode = null;
  db.results["events:select"] = () => ({ data: event, error: null });
  db.results["ticket_types:select"] = () => ({ data: ticketType, error: null });
  db.results["discount_codes:select"] = () => ({ data: discountCode, error: null });
});

function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("first_name", "Anna Maria");
  fd.set("last_name", "Kowalska-Nowak");
  fd.set("email", "anna@example.com");
  fd.set("gdpr_consent", "1");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function catchRedirect(p: Promise<unknown>): Promise<{ url?: string; result?: unknown }> {
  try {
    return { result: await p };
  } catch (e) {
    return { url: (e as { url?: string }).url };
  }
}

describe("bilet darmowy", () => {
  it("wydarzenie z zatwierdzaniem: uczestnik oczekujący, mail o oczekiwaniu, bez QR", async () => {
    event.requires_approval = true;
    const { url } = await catchRedirect(completeFreeCheckout("ev1", "konf", "tt1", { status: "idle" }, form()));
    const [attendee] = db.inserts("attendees");
    expect(attendee.status).toBe("pending");
    expect(mail.pending).toHaveBeenCalledTimes(1);
    expect(mail.confirmation).not.toHaveBeenCalled();
    expect(url).toContain("/welcome?name=Anna%20Maria&status=pending");
  });

  it("wydarzenie bez zatwierdzania: uczestnik zatwierdzony i bilet z QR (jak dotąd)", async () => {
    const { url } = await catchRedirect(completeFreeCheckout("ev1", "konf", "tt1", { status: "idle" }, form()));
    expect(db.inserts("attendees")[0].status).toBe("approved");
    expect(mail.confirmation).toHaveBeenCalledTimes(1);
    expect(url).toContain("/checkout/success");
  });
});

describe("bilet płatny z kodem rabatowym 100%", () => {
  beforeEach(() => {
    ticketType = { id: "tt1", price: 4999, quantity_total: 10, sales_start: null, sales_end: null };
    discountCode = { id: "dc1", kind: "percent", value: 100, max_uses: 5, uses_count: 0, ticket_type_id: null, valid_from: null, valid_until: null };
  });

  it("zamówienie bez płatności: bez Przelewy24, kod zużyty atomowo, bilet wystawiony", async () => {
    const { url } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "prelegent", marketing_consent: "on" })),
    );
    expect(url).toContain("/checkout/success");
    expect(p24.registerTransaction).not.toHaveBeenCalled();
    expect(p24.getPaymentConfig).not.toHaveBeenCalled();
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["try_use_discount_code", "try_reserve_ticket_quantity"]);
    const [order] = db.inserts("orders");
    expect(order).toMatchObject({ status: "paid", total_amount: 0, discount_code_id: "dc1", marketing_consent: true });
    expect(db.inserts("order_items")[0]).toMatchObject({ unit_price: 4999, line_total: 0 });
    expect(db.inserts("attendees")[0]).toMatchObject({
      first_name: "Anna Maria",
      last_name: "Kowalska-Nowak",
      marketing_consent: true,
    });
    expect(db.inserts("tickets")).toHaveLength(1);
  });

  it("kod wyczerpany w międzyczasie: błąd, bez uczestnika", async () => {
    db.rpcResults.try_use_discount_code = () => ({ data: false, error: null });
    const { result } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "prelegent" })),
    );
    expect(result).toEqual({ status: "error", message: "Kod rabatowy wyczerpany." });
    expect(db.inserts("attendees")).toHaveLength(0);
  });

  it("brak miejsc: użycie kodu oddane", async () => {
    db.rpcResults.try_reserve_ticket_quantity = () => ({ data: false, error: null });
    const { result } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "prelegent" })),
    );
    expect((result as { status: string }).status).toBe("error");
    expect(db.rpcCalls.map((c) => c.fn)).toContain("release_discount_code_use");
  });

  it("wydarzenie z zatwierdzaniem: uczestnik oczekujący jak przy rejestracji", async () => {
    event.requires_approval = true;
    const { url } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "prelegent" })),
    );
    expect(db.inserts("attendees")[0].status).toBe("pending");
    expect(url).toContain("status=pending");
  });
});

describe("bilet płatny przez Przelewy24", () => {
  beforeEach(() => {
    ticketType = { id: "tt1", price: 4999, quantity_total: 10, sales_start: null, sales_end: null };
    discountCode = { id: "dc1", kind: "percent", value: 20, max_uses: 5, uses_count: 0, ticket_type_id: null, valid_from: null, valid_until: null };
  });

  it("start płatności nie zwiększa licznika kodu; zamówienie ma imię, nazwisko i zgodę", async () => {
    const { url } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "lato", marketing_consent: "on" })),
    );
    expect(url).toContain("/trnRequest/tok");
    expect(db.calls.filter((c) => c.table === "discount_codes" && c.op === "update")).toHaveLength(0);
    expect(db.rpcCalls.map((c) => c.fn)).not.toContain("try_use_discount_code");
    expect(db.inserts("orders")[0]).toMatchObject({
      status: "pending",
      total_amount: 4000,
      discount_code_id: "dc1",
      buyer_first_name: "Anna Maria",
      buyer_last_name: "Kowalska-Nowak",
      marketing_consent: true,
    });
  });

  it("limit kodu uwzględnia trwające płatności z tym kodem", async () => {
    discountCode = { ...discountCode!, max_uses: 2, uses_count: 1 };
    db.results["orders:select"] = () => ({ data: null, error: null, count: 1 });
    const { result } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "lato" })),
    );
    expect(result).toEqual({ status: "error", message: "Kod rabatowy wyczerpany." });
    expect(db.inserts("orders")).toHaveLength(0);
  });

  it("brak konfiguracji płatności nadal blokuje zakup z częściowym rabatem", async () => {
    p24.getPaymentConfig.mockResolvedValueOnce(null);
    const { result } = await catchRedirect(
      startPaidCheckout("ev1", "konf", "tt1", { status: "idle" }, form({ discount_code: "lato" })),
    );
    expect((result as { message: string }).message).toMatch(/nie sa skonfigurowane/);
    expect(db.inserts("orders")).toHaveLength(0);
  });
});
