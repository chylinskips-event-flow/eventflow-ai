import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SETTINGS, type LogisticsSettings } from "@/lib/booth-requests-core";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

const db = createDbMock();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/request-origin", () => ({ getOrigin: () => "https://test" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/email/booth-request", () => ({ sendBoothRequestSubmittedEmail: vi.fn(async () => {}) }));

const PARTNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Zalogowany ma dostęp tylko do partnera A (getPartnerContext sprawdza partner_access).
vi.mock("@/lib/partner-portal", () => ({
  getPartnerContext: async (partnerId: string) =>
    partnerId === PARTNER_A
      ? {
          user: { id: "u1", email: "a@firma.pl" },
          accessId: "acc1",
          partner: { id: PARTNER_A, name: "Firma A", tier: "gold" },
          event: { id: "ev1", organization_id: "org1", name: "Targi", timezone: "Europe/Warsaw" },
        }
      : null,
}));

const state: { settings: LogisticsSettings } = { settings: EMPTY_SETTINGS };
vi.mock("@/lib/booth-requests", () => ({
  BOOTH_LOAD_ERROR: "Nie udało się wczytać wniosku.",
  loadBoothData: async (fn: () => Promise<unknown>) => ({ ok: true, value: await fn() }),
  ensureDefaultCatalog: async () => {},
  getLogisticsSettings: async () => state.settings,
  getCatalog: async () => [
    { id: "c1", name: "Stół", unit: "szt.", description: null, active: true, sort_order: 0, included_by_tier: {} },
  ],
  getBoothRequest: async () => null,
  getOrganizerEmail: async () => null,
}));

const { submitBoothRequest } = await import("../booth-actions");
const idle = { status: "idle" as const };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const WINDOW = { date: "2026-11-17", from: "14:00", to: "20:00" };

beforeEach(() => {
  db.reset();
  state.settings = { ...EMPTY_SETTINGS, setup_windows: [WINDOW], slot_step_minutes: 30 };
});

describe("wniosek partnera — izolacja", () => {
  it("partner B (podmieniony partnerId) nie może zapisać wniosku", async () => {
    const res = await submitBoothRequest(PARTNER_B, idle, form({ qty_c1: "2" }));
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/Brak dostępu/) });
    expect(db.writes()).toEqual([]);
  });

  it("zapis zawsze w zakresie partnera i eventu z kontekstu, nie z formularza", async () => {
    const res = await submitBoothRequest(PARTNER_A, idle, form({ qty_c1: "2", partner_id: PARTNER_B, event_id: "evX" }));
    expect(res.status).toBe("success");
    const inserts = db.writes().filter((c) => c.op === "insert");
    expect(inserts.length).toBeGreaterThan(0);
    for (const c of inserts) {
      const rows = Array.isArray(c.payload) ? c.payload : [c.payload];
      for (const r of rows as { partner_id: string; event_id: string }[]) {
        expect(r.partner_id).toBe(PARTNER_A);
        expect(r.event_id).toBe("ev1");
      }
    }
  });
});

describe("wniosek partnera — okno montażu i krok", () => {
  it("okno 14:00–20:00, wybór 16:00–18:00 → zapisany (strefa wydarzenia)", async () => {
    const res = await submitBoothRequest(
      PARTNER_A,
      idle,
      form({ qty_c1: "1", setup_date: "2026-11-17", setup_from: "16:00", setup_to: "18:00" }),
    );
    expect(res.status).toBe("success");
    const req = db.writes().find((c) => c.table === "partner_booth_requests")?.payload as Record<string, unknown>;
    // 17.11 w Warszawie = UTC+1.
    expect(req.setup_start).toBe("2026-11-17T15:00:00.000Z");
    expect(req.setup_end).toBe("2026-11-17T17:00:00.000Z");
  });

  it.each([
    ["przed oknem", "13:30", "15:00"],
    ["po oknie", "19:00", "21:00"],
    ["poza krokiem 30 min", "16:10", "18:00"],
  ])("odrzuca wybór %s", async (_label, from, to) => {
    const res = await submitBoothRequest(
      PARTNER_A,
      idle,
      form({ qty_c1: "1", setup_date: "2026-11-17", setup_from: from, setup_to: to }),
    );
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/poza godzinami ustalonymi/) });
    expect(db.writes()).toEqual([]);
  });

  it("odrzuca inny dzień niż w oknie", async () => {
    const res = await submitBoothRequest(
      PARTNER_A,
      idle,
      form({ qty_c1: "1", setup_date: "2026-11-18", setup_from: "16:00", setup_to: "18:00" }),
    );
    expect(res.status).toBe("error");
    expect(db.writes()).toEqual([]);
  });
});

describe("wniosek partnera — numer rejestracyjny", () => {
  it("wymagany przełącznikiem: pojazd bez numeru nie przechodzi", async () => {
    state.settings = { ...state.settings, require_vehicle_plate: true };
    const res = await submitBoothRequest(PARTNER_A, idle, form({ qty_c1: "1", vehicle: "on" }));
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/numer rejestracyjny/i) });
    expect(db.writes()).toEqual([]);
  });

  it("zapisywany znormalizowany (wielkie litery, pojedyncze spacje)", async () => {
    state.settings = { ...state.settings, require_vehicle_plate: true };
    const res = await submitBoothRequest(PARTNER_A, idle, form({ qty_c1: "1", vehicle: "on", vehicle_plate: "  el   12345 " }));
    expect(res.status).toBe("success");
    const req = db.writes().find((c) => c.table === "partner_booth_requests")?.payload as Record<string, unknown>;
    expect(req.vehicle_plate).toBe("EL 12345");
  });
});
