import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

const db = createDbMock();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/request-origin", () => ({ getOrigin: () => "https://test" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/email/booth-request", () => ({ sendBoothDecisionEmail: vi.fn(async () => {}) }));

const EVENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PARTNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_EVENT_PARTNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM = "11111111-1111-4111-8111-111111111111";

const auth = { ownsEvent: true, planOk: true };
const booth: { request: unknown } = { request: null };
vi.mock("@/lib/events", () => ({
  getOwnEvent: async () => (auth.ownsEvent ? { id: EVENT, organization_id: "org1", name: "Targi", timezone: "Europe/Warsaw" } : null),
}));
vi.mock("@/lib/entitlements", () => ({
  featureGate: async () => (auth.planOk ? { ok: true } : { ok: false, message: "Panel partnera jest dostępny w planie Business i wyższych." }),
}));
vi.mock("@/lib/booth-requests", () => ({
  BOOTH_LOAD_ERROR: "Nie udało się wczytać wniosku.",
  loadBoothData: async (fn: () => Promise<unknown>) => ({ ok: true, value: await fn() }),
  getBoothRequest: async () => booth.request,
  getCatalog: async () => [],
  getPartnerRecipientEmails: async () => [],
}));

const { decideBoothItem, approveBoothItemsInPackage } = await import("../booth-actions");
const idle = { status: "idle" as const };
const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  db.reset();
  auth.ownsEvent = true;
  auth.planOk = true;
  booth.request = null;
  // Partner istnieje tylko w TYM evencie (zapytanie filtruje po id i event_id).
  db.results["partners:select"] = (c) => {
    const id = c.filters.find(([k]) => k === "id")?.[1];
    const ev = c.filters.find(([k]) => k === "event_id")?.[1];
    return { data: id === PARTNER && ev === EVENT ? { id: PARTNER, name: "Firma A", tier: "gold" } : null, error: null };
  };
  db.results["partner_booth_request_items:select"] = () => ({ data: { qty: 4 }, error: null });
});

describe("decyzje organizatora — dostęp", () => {
  it("bramka planu: poniżej partner_portal akcja odrzucona bez zapisu", async () => {
    auth.planOk = false;
    const res = await decideBoothItem(EVENT, PARTNER, ITEM, "approve", idle, fd({}));
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/planie Business/) });
    await expect(approveBoothItemsInPackage(EVENT, PARTNER)).resolves.toMatchObject({ status: "error" });
    expect(db.writes()).toEqual([]);
  });

  it("cudzy event → brak dostępu", async () => {
    auth.ownsEvent = false;
    const res = await decideBoothItem(EVENT, PARTNER, ITEM, "approve", idle, fd({}));
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/Brak dostępu/) });
    expect(db.writes()).toEqual([]);
  });

  it("partner spoza eventu (podmieniony partnerId) → odrzucone", async () => {
    const res = await decideBoothItem(EVENT, OTHER_EVENT_PARTNER, ITEM, "approve", idle, fd({}));
    expect(res).toMatchObject({ status: "error", message: "Partner nie istnieje." });
    expect(db.writes()).toEqual([]);
  });

  it("zapis decyzji zawężony do partnera i eventu", async () => {
    const res = await decideBoothItem(EVENT, PARTNER, ITEM, "reject", idle, fd({ decision_note: "Brak miejsca" }));
    expect(res.status).toBe("success");
    const upd = db.writes().find((c) => c.table === "partner_booth_request_items");
    expect(upd?.filters).toEqual(expect.arrayContaining([["id", ITEM], ["partner_id", PARTNER], ["event_id", EVENT]]));
    expect(upd?.payload).toMatchObject({ status: "rejected", decision_note: "Brak miejsca" });
  });
});

describe("decyzje organizatora — inna ilość", () => {
  it("ilość większa niż wnioskowana albo 0 → błąd, bez zapisu", async () => {
    expect(await decideBoothItem(EVENT, PARTNER, ITEM, "change", idle, fd({ approved_qty: "5" }))).toMatchObject({ status: "error" });
    expect(await decideBoothItem(EVENT, PARTNER, ITEM, "change", idle, fd({ approved_qty: "0" }))).toMatchObject({
      status: "error",
      message: expect.stringMatching(/Odrzuć/),
    });
    expect(db.writes()).toEqual([]);
  });

  it("ilość równa wnioskowanej → „Zatwierdzone”, mniejsza → „inna ilość”", async () => {
    await decideBoothItem(EVENT, PARTNER, ITEM, "change", idle, fd({ approved_qty: "4" }));
    await decideBoothItem(EVENT, PARTNER, ITEM, "change", idle, fd({ approved_qty: "2" }));
    const [same, less] = db.writes().filter((c) => c.table === "partner_booth_request_items");
    expect(same.payload).toMatchObject({ status: "approved", approved_qty: null });
    expect(less.payload).toMatchObject({ status: "changed", approved_qty: 2 });
    // Decyzja dotyczy ilości, którą widział organizator.
    expect(less.filters).toContainEqual(["qty", 4]);
  });
});

describe("zmiana po terminie", () => {
  it("po rozstrzygnięciu wszystkich pozycji etykieta „Zmiana po terminie” jest zdejmowana", async () => {
    booth.request = {
      id: "r1",
      partner_id: PARTNER,
      late_change_at: "2026-10-16T10:00:00Z",
      items: [{ id: ITEM, status: "approved", qty: 4, approved_qty: null }],
    };
    await decideBoothItem(EVENT, PARTNER, ITEM, "approve", idle, fd({}));
    const clear = db.writes().find((c) => c.table === "partner_booth_requests");
    expect(clear?.payload).toEqual({ late_change_at: null });
    expect(clear?.filters).toContainEqual(["partner_id", PARTNER]);
  });

  it("dopóki coś czeka na decyzję, etykieta zostaje", async () => {
    booth.request = {
      id: "r1",
      partner_id: PARTNER,
      late_change_at: "2026-10-16T10:00:00Z",
      items: [{ id: ITEM, status: "pending", qty: 4, approved_qty: null }],
    };
    await decideBoothItem(EVENT, PARTNER, ITEM, "approve", idle, fd({}));
    expect(db.writes().find((c) => c.table === "partner_booth_requests")).toBeUndefined();
  });
});
