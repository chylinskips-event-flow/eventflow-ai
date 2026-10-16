import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";
import type { BoothRequest, RequestItem } from "@/lib/booth-requests-core";

const db = createDbMock();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/request-origin", () => ({ getOrigin: () => "https://test" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
const emails: unknown[] = [];
vi.mock("@/lib/email/booth-request", () => ({
  sendBoothTimesNeedFixEmail: vi.fn(async (p: unknown) => void emails.push(p)),
}));

const EVENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const auth = { planOk: true };
vi.mock("@/lib/events", () => ({
  getOwnEvent: async () => ({ id: EVENT, organization_id: "org1", name: "Targi", slug: "targi", timezone: "Europe/Warsaw" }),
}));
vi.mock("@/lib/entitlements", () => ({
  featureGate: async () => (auth.planOk ? { ok: true } : { ok: false, message: "Dostępne w planie Business i wyższych." }),
}));

function request(over: Partial<BoothRequest>): BoothRequest {
  return {
    id: "r1",
    partner_id: "p1",
    submitted_at: "2026-10-16T10:00:00Z",
    late_change_at: null,
    times_need_fix: false,
    items: [],
    crew_count: 2,
    setup_start: null,
    setup_end: null,
    teardown_start: null,
    teardown_end: null,
    setup_note: null,
    teardown_note: null,
    vehicle: false,
    vehicle_note: null,
    vehicle_plate: null,
    vehicle_type: null,
    ...over,
  };
}

const data = { requests: [] as BoothRequest[] };
vi.mock("@/lib/booth-requests", async () => {
  const core = await import("@/lib/booth-requests-core");
  return {
    loadBoothData: async (fn: () => Promise<unknown>) => ({ ok: true, value: await fn() }),
    getCatalog: async () => [],
    getEventBoothRequests: async () => data.requests,
    getPartnerRecipientEmails: async () => ["a@firma.pl"],
    getLogisticsData: async () => {
      const catalog = [
        { id: "c1", name: "Stół", unit: "szt." },
        { id: "c2", name: "Krzesło; składane", unit: "szt." },
      ];
      const items = (partnerId: string) =>
        data.requests.find((r) => r.partner_id === partnerId)?.items ?? [];
      const booths = [
        { partnerId: "p1", partnerName: "Firma A", tier: "gold", boothLocation: "A1", request: data.requests[0] },
        { partnerId: "p2", partnerName: "Firma B", tier: null, boothLocation: null, request: data.requests[1] },
      ];
      const totals = core.aggregateTotals(
        booths.map((b) => ({ partnerId: b.partnerId, partnerName: b.partnerName, items: items(b.partnerId) })),
        catalog,
      );
      return { settings: core.EMPTY_SETTINGS, catalog, partners: [], booths, totals };
    },
  };
});

const { saveLogisticsSettings } = await import("../actions");
const { GET } = await import("../logistics.csv/route");
const idle = { status: "idle" as const };

function settingsForm(windows: [string, string, string][]) {
  const f = new FormData();
  f.set("slot_step_minutes", "30");
  for (const [d, from, to] of windows) {
    f.append("setup_date", d);
    f.append("setup_from", from);
    f.append("setup_to", to);
  }
  return f;
}

const item = (over: Partial<RequestItem>): RequestItem => ({
  id: "i",
  catalog_item_id: "c1",
  label: "Stół",
  unit: "szt.",
  qty: 2,
  note: null,
  status: "approved",
  approved_qty: null,
  decision_note: null,
  reviewed_at: null,
  ...over,
});

beforeEach(() => {
  db.reset();
  emails.length = 0;
  auth.planOk = true;
  data.requests = [];
});

describe("ustawienia logistyki", () => {
  it("bramka planu: zapis odrzucony bez zmian w bazie", async () => {
    auth.planOk = false;
    const res = await saveLogisticsSettings(EVENT, idle, settingsForm([["2026-11-17", "14:00", "20:00"]]));
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/planie Business/) });
    expect(db.writes()).toEqual([]);
  });

  it("zmiana okna po złożeniu wniosku: godziny poza oknem → „do poprawy” + e-mail do partnera", async () => {
    // Partner wybrał 17.11 16:00–18:00 (Warszawa, UTC+1).
    data.requests = [
      request({ id: "r1", partner_id: "p1", setup_start: "2026-11-17T15:00:00Z", setup_end: "2026-11-17T17:00:00Z" }),
      request({ id: "r2", partner_id: "p2", setup_start: "2026-11-17T18:00:00Z", setup_end: "2026-11-17T18:30:00Z" }),
    ];
    // Nowe okno 18:00–20:00: r1 poza oknem, r2 (19:00–19:30) w oknie.
    const res = await saveLogisticsSettings(EVENT, idle, settingsForm([["2026-11-17", "18:00", "20:00"]]));
    expect(res).toMatchObject({ status: "success", message: expect.stringMatching(/do poprawy/) });
    const flagged = db.writes().filter((c) => c.table === "partner_booth_requests");
    expect(flagged).toHaveLength(1);
    expect(flagged[0].payload).toEqual({ times_need_fix: true });
    expect(flagged[0].filters).toContainEqual(["id", "r1"]);
    expect(emails).toHaveLength(1);
  });

  it("wniosek mieszczący się w nowym oknie zdejmuje „do poprawy”", async () => {
    data.requests = [
      request({ times_need_fix: true, setup_start: "2026-11-17T15:00:00Z", setup_end: "2026-11-17T17:00:00Z" }),
    ];
    await saveLogisticsSettings(EVENT, idle, settingsForm([["2026-11-17", "14:00", "20:00"]]));
    const upd = db.writes().find((c) => c.table === "partner_booth_requests");
    expect(upd?.payload).toEqual({ times_need_fix: false });
    expect(emails).toHaveLength(0);
  });
});

describe("CSV: sumy", () => {
  it("bramka planu: 403", async () => {
    auth.planOk = false;
    const res = await GET(new Request("https://test/x?view=totals"), { params: Promise.resolve({ eventId: EVENT }) });
    expect(res.status).toBe(403);
  });

  it("sumy zgodne z tabelą: BOM, średnik, zatwierdzone + oczekujące, rozbicie", async () => {
    data.requests = [
      request({
        partner_id: "p1",
        items: [item({ id: "1", qty: 2 }), item({ id: "2", catalog_item_id: "c2", label: "Krzesło; składane", qty: 4, status: "changed", approved_qty: 3 })],
      }),
      request({ id: "r2", partner_id: "p2", items: [item({ id: "3", qty: 1, status: "pending" })] }),
    ];
    const res = await GET(new Request("https://test/x?view=totals"), { params: Promise.resolve({ eventId: EVENT }) });
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(/logistyka-sumy-targi\.csv/);
    // Surowe bajty: Response.text() przy dekodowaniu UTF-8 zjada BOM.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: false }).decode(bytes);
    expect(text.split("\r\n")).toEqual([
      "Pozycja;Jednostka;Zatwierdzone;Oczekujące;Rozbicie na partnerów (zatwierdzone)",
      "Stół;szt.;2;1;Firma A: 2",
      '"Krzesło; składane";szt.;3;0;Firma A: 3',
    ]);
  });
});
