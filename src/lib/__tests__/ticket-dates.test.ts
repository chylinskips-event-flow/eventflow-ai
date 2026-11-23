import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutDbMock } from "./helpers/checkout-db-mock";

// Okna sprzedaży biletów i ważność kodów: godzina z pola datetime-local to czas wydarzenia
// (Europe/Warsaw, z uwzględnieniem czasu letniego), zapis w UTC, odczyt z powrotem w tej strefie.

const db = createCheckoutDbMock();
const own = { event: null as null | Record<string, unknown> };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("@/lib/tickets", () => ({ getTicketTypes: async () => [] }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { parseOptionalDateTimeLocal, toDateTimeLocalValue } = await import("@/lib/format");
const actions = await import("@/app/(organizer)/admin/events/[eventId]/tickets/actions");

beforeEach(() => {
  db.reset();
  own.event = { id: "ev1", organization_id: "org1", timezone: "Europe/Warsaw" };
});

describe("parseOptionalDateTimeLocal", () => {
  it("zima: CET (UTC+1)", () => {
    expect(parseOptionalDateTimeLocal("2026-01-15T10:00", "Europe/Warsaw")).toBe("2026-01-15T09:00:00.000Z");
  });

  it("lato: CEST (UTC+2)", () => {
    expect(parseOptionalDateTimeLocal("2026-07-15T10:00", "Europe/Warsaw")).toBe("2026-07-15T08:00:00.000Z");
  });

  it("dzień zmiany czasu (29.03.2026) po przestawieniu zegarów", () => {
    expect(parseOptionalDateTimeLocal("2026-03-29T12:00", "Europe/Warsaw")).toBe("2026-03-29T10:00:00.000Z");
  });

  it("brak strefy wydarzenia → Europe/Warsaw", () => {
    expect(parseOptionalDateTimeLocal("2026-07-15T10:00", null)).toBe("2026-07-15T08:00:00.000Z");
  });

  it("puste pole → null, zły format lub nieistniejąca data → undefined", () => {
    expect(parseOptionalDateTimeLocal(null, "Europe/Warsaw")).toBeNull();
    expect(parseOptionalDateTimeLocal("", "Europe/Warsaw")).toBeNull();
    expect(parseOptionalDateTimeLocal("jutro", "Europe/Warsaw")).toBeUndefined();
    expect(parseOptionalDateTimeLocal("2026-02-30T10:00", "Europe/Warsaw")).toBeUndefined();
    expect(parseOptionalDateTimeLocal("2026-07-15T10:00:00Z", "Europe/Warsaw")).toBeUndefined();
  });

  it("odczyt z powrotem daje tę samą godzinę w polu formularza", () => {
    const iso = parseOptionalDateTimeLocal("2026-07-15T10:00", "Europe/Warsaw")!;
    expect(toDateTimeLocalValue(iso, "Europe/Warsaw")).toBe("2026-07-15T10:00");
  });
});

function ticketForm(extra: Record<string, string>) {
  const fd = new FormData();
  fd.set("name", "Normalny");
  fd.set("price_pln", "49.99");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("akcje biletów zapisują daty w UTC wg strefy wydarzenia", () => {
  it("nowy typ biletu: okno sprzedaży przeliczone z czasu polskiego", async () => {
    const res = await actions.createTicketType(
      "ev1",
      { status: "idle" },
      ticketForm({ sales_start: "2026-07-01T09:00", sales_end: "2026-12-01T18:00" }),
    );
    expect(res.status).toBe("success");
    const [row] = db.inserts("ticket_types");
    expect(row.sales_start).toBe("2026-07-01T07:00:00.000Z");
    expect(row.sales_end).toBe("2026-12-01T17:00:00.000Z");
  });

  it("edycja typu biletu: to samo przeliczenie", async () => {
    const res = await actions.updateTicketType(
      "ev1",
      "tt1",
      { status: "idle" },
      ticketForm({ sales_start: "2026-01-10T08:30", enabled: "on" }),
    );
    expect(res.status).toBe("success");
    const upd = db.calls.find((c) => c.table === "ticket_types" && c.op === "update");
    expect((upd!.payload as Record<string, unknown>).sales_start).toBe("2026-01-10T07:30:00.000Z");
    expect((upd!.payload as Record<string, unknown>).sales_end).toBeNull();
  });

  it("koniec przed początkiem lub zła data → błąd bez zapisu", async () => {
    const bad = await actions.createTicketType(
      "ev1",
      { status: "idle" },
      ticketForm({ sales_start: "2026-07-02T09:00", sales_end: "2026-07-01T09:00" }),
    );
    expect(bad.status).toBe("error");
    const invalid = await actions.createTicketType("ev1", { status: "idle" }, ticketForm({ sales_end: "xx" }));
    expect(invalid.status).toBe("error");
    expect(db.inserts("ticket_types")).toHaveLength(0);
  });

  it("kod rabatowy: ważność w czasie wydarzenia", async () => {
    const fd = new FormData();
    fd.set("code", "lato");
    fd.set("kind", "percent");
    fd.set("value", "10");
    fd.set("valid_from", "2026-06-01T00:00");
    fd.set("valid_until", "2026-08-31T23:59");
    const res = await actions.createDiscountCode("ev1", { status: "idle" }, fd);
    expect(res.status).toBe("success");
    const [row] = db.inserts("discount_codes");
    expect(row.valid_from).toBe("2026-05-31T22:00:00.000Z");
    expect(row.valid_until).toBe("2026-08-31T21:59:00.000Z");
  });

  it("bez właściciela wydarzenia: brak dostępu i brak zapisu", async () => {
    own.event = null;
    const res = await actions.createTicketType("ev1", { status: "idle" }, ticketForm({}));
    expect(res.status).toBe("error");
    expect(db.calls).toHaveLength(0);
  });
});
