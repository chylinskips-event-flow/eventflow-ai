import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutDbMock } from "./helpers/checkout-db-mock";

// Bilety: usunięcie uczestnika zwalnia miejsce, usuwanie typu biletu z zamówieniami daje
// komunikat, kody przypisane do usuwanego typu są wyłączane, edycja płatnego typu po zmianie
// planu, sprzedaż płatnych typów tylko przy funkcji planu, limit uczestników z trwającymi
// płatnościami.

const db = createCheckoutDbMock();
const own = { event: null as null | Record<string, unknown> };
const gate = { ok: true as boolean };
const featureGateCalls: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("@/lib/entitlements", () => ({
  featureGate: async (_org: string, feature: string) => {
    featureGateCalls.push(feature);
    return gate.ok ? { ok: true } : { ok: false, message: "Bilety płatne — niedostępne w Twoim planie." };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const actions = await import("@/app/(organizer)/admin/events/[eventId]/tickets/actions");
const { deleteAttendeeCompletely } = await import("@/lib/attendee-deletion");
const { isTicketTypeSellable } = await import("@/lib/tickets");

beforeEach(() => {
  db.reset();
  own.event = { id: "ev1", organization_id: "org1", timezone: "Europe/Warsaw" };
  gate.ok = true;
  featureGateCalls.length = 0;
});

describe("usunięcie uczestnika zwalnia jego bilety", () => {
  it("przed usunięciem rekordu wołana jest funkcja zwalniająca bilety w obrębie wydarzenia", async () => {
    db.results["attendees:select"] = () => ({ data: { avatar_url: null, event_id: "ev1" }, error: null });
    const res = await deleteAttendeeCompletely("att1");
    expect(res.error).toBeNull();
    expect(db.rpcCalls).toEqual([
      { fn: "release_deleted_attendee_tickets", args: { p_event_id: "ev1", p_attendee_id: "att1" } },
    ]);
    const del = db.calls.find((c) => c.table === "attendees" && c.op === "delete");
    expect(del?.filters).toContainEqual(["eq:id", "att1"]);
  });

  it("błąd zwolnienia nie blokuje usunięcia danych", async () => {
    db.results["attendees:select"] = () => ({ data: { avatar_url: null, event_id: "ev1" }, error: null });
    db.rpcResults.release_deleted_attendee_tickets = () => ({ data: null, error: { message: "x" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await deleteAttendeeCompletely("att1");
    expect(res.error).toBeNull();
    expect(db.calls.some((c) => c.table === "attendees" && c.op === "delete")).toBe(true);
    spy.mockRestore();
  });

  it("nieistniejący uczestnik: brak zwalniania", async () => {
    await deleteAttendeeCompletely("att-x");
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe("usuwanie typu biletu", () => {
  it("typ z zamówieniami: czytelny komunikat, bez usuwania", async () => {
    db.results["order_items:select"] = () => ({ data: null, error: null, count: 2 });
    const res = await actions.deleteTicketType("ev1", "tt1");
    expect(res).toEqual({
      ok: false,
      message: "Nie można usunąć typu biletu, który ma zamówienia — wyłącz sprzedaż.",
    });
    expect(db.calls.some((c) => c.table === "ticket_types" && c.op === "delete")).toBe(false);
  });

  it("zamówienie powstało w międzyczasie (klucz obcy): ten sam komunikat", async () => {
    db.results["ticket_types:delete"] = () => ({ data: null, error: { code: "23503", message: "fk" } });
    const res = await actions.deleteTicketType("ev1", "tt1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("wyłącz sprzedaż");
  });

  it("typ bez zamówień: usunięty w obrębie wydarzenia", async () => {
    const res = await actions.deleteTicketType("ev1", "tt1");
    expect(res).toEqual({ ok: true });
    const del = db.calls.find((c) => c.table === "ticket_types" && c.op === "delete");
    expect(del?.filters).toEqual([
      ["eq:id", "tt1"],
      ["eq:event_id", "ev1"],
    ]);
  });

  it("bez uprawnień do wydarzenia: nic nie jest usuwane", async () => {
    own.event = null;
    const res = await actions.deleteTicketType("ev1", "tt1");
    expect(res.ok).toBe(false);
    expect(db.calls).toHaveLength(0);
  });

  it("migracja wyłącza kody rabatowe przypisane do usuwanego typu", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20261124130001_disable_discount_codes_on_ticket_type_delete.sql"),
      "utf8",
    ).toLowerCase();
    expect(sql).toMatch(/before delete on public\.ticket_types/);
    expect(sql).toMatch(/set enabled = false/);
    expect(sql).toMatch(/where ticket_type_id = old\.id/);
  });
});

describe("edycja płatnego typu biletu po zmianie planu", () => {
  function form(price: string) {
    const fd = new FormData();
    fd.set("name", "VIP (nowa nazwa)");
    fd.set("price_pln", price);
    return fd;
  }

  it("bez zmiany ceny: zapis bez bramki planu", async () => {
    gate.ok = false;
    db.results["ticket_types:select"] = () => ({ data: { price: 9900 }, error: null });
    const res = await actions.updateTicketType("ev1", "tt1", { status: "idle" }, form("99"));
    expect(res.status).toBe("success");
    expect(featureGateCalls).toHaveLength(0);
  });

  it("nowa cena płatna: bramka planu nadal obowiązuje", async () => {
    gate.ok = false;
    db.results["ticket_types:select"] = () => ({ data: { price: 9900 }, error: null });
    const res = await actions.updateTicketType("ev1", "tt1", { status: "idle" }, form("120"));
    expect(res.status).toBe("error");
    expect(db.calls.some((c) => c.table === "ticket_types" && c.op === "update")).toBe(false);
  });

  it("darmowy typ zmieniany na płatny: bramka planu", async () => {
    gate.ok = false;
    db.results["ticket_types:select"] = () => ({ data: { price: 0 }, error: null });
    const res = await actions.updateTicketType("ev1", "tt1", { status: "idle" }, form("10"));
    expect(res.status).toBe("error");
    expect(featureGateCalls).toEqual(["tickets_paid"]);
  });

  it("typ z innego wydarzenia: błąd bez zapisu", async () => {
    const res = await actions.updateTicketType("ev1", "tt-obcy", { status: "idle" }, form("0"));
    expect(res.status).toBe("error");
    expect(db.calls.some((c) => c.op === "update")).toBe(false);
  });
});

describe("sprzedaż płatnych typów zależy od planu", () => {
  it("darmowy zawsze, płatny tylko z funkcją biletów płatnych", () => {
    expect(isTicketTypeSellable({ price: 0 }, false)).toBe(true);
    expect(isTicketTypeSellable({ price: 4999 }, false)).toBe(false);
    expect(isTicketTypeSellable({ price: 4999 }, true)).toBe(true);
  });
});

describe("migracja zwolnienia biletów usuwanego uczestnika", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20261124130000_release_tickets_on_attendee_delete.sql"),
    "utf8",
  ).toLowerCase();

  it("tylko bilety tego uczestnika w tym wydarzeniu, bez zmiany opłaconych zamówień", () => {
    expect(sql).toMatch(/t\.attendee_id = p_attendee_id/);
    expect(sql).toMatch(/t\.event_id = p_event_id/);
    expect(sql).toMatch(/release_rejected_attendee_tickets\(p_event_id, p_attendee_id\)/);
    const fn = sql.slice(sql.indexOf("function public.release_deleted_attendee_tickets"), sql.indexOf("revoke all"));
    expect(fn).not.toMatch(/update public\.orders/);
  });

  it("wykonanie tylko dla service_role", () => {
    expect(sql).toMatch(/revoke all on function public\.release_deleted_attendee_tickets\(uuid, uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.release_deleted_attendee_tickets\(uuid, uuid\) to service_role/);
  });
});
