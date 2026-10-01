import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Atrapa klienta service-role: tabela → wynik zapytania.
const tables: Record<string, { data: unknown; error: { message: string } | null }> = {};
const createAdminClient = vi.fn(() => ({
  from: (table: string) => {
    const result = tables[table] ?? { data: null, error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      order: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
// React.cache poza RSC nie cache'uje między wywołaniami testów — wystarczy przepuścić funkcję.
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

const plans = [
  {
    key: "free",
    name: "Free",
    sort_order: 0,
    is_active: true,
    features: { badges: false, business_mixer: false },
    limits: { max_attendees_per_event: 75, ticket_commission_pct: 4 },
  },
  {
    key: "business",
    name: "Business",
    sort_order: 20,
    is_active: true,
    features: { badges: true, business_mixer: true },
    limits: { max_attendees_per_event: null, ticket_commission_pct: 1.5 },
  },
];

async function load() {
  vi.resetModules();
  return import("../entitlements");
}

beforeEach(() => {
  createAdminClient.mockClear();
  for (const k of Object.keys(tables)) delete tables[k];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("entitlements (BILLING_ENABLED=false)", () => {
  it("pełny dostęp, prowizja 0% i zero zapytań do bazy", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    const e = await load();
    expect(await e.hasFeature("org", "business_mixer")).toBe(true);
    expect(await e.getLimit("org", "max_attendees_per_event")).toBeNull();
    expect(await e.getTicketCommissionPct("org")).toBe(0);
    expect(await e.featureGate("org", "badges")).toEqual({ ok: true });
    expect(await e.isAttendeeLimitReached({ id: "ev", organization_id: "org" })).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("entitlements (BILLING_ENABLED=true)", () => {
  it("org bez subskrypcji → Free: bramka z komunikatem o planie Business", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    tables.plans = { data: plans, error: null };
    const e = await load();
    expect(await e.hasFeature("org", "business_mixer")).toBe(false);
    expect(await e.featureGate("org", "business_mixer")).toEqual({
      ok: false,
      message: "Business Mixer — dostępne w planie Business i wyższych.",
    });
    expect(await e.getTicketCommissionPct("org")).toBe(4);
  });

  it("override pilota (grandfathering) daje plan Business", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    tables.plans = { data: plans, error: null };
    tables.entitlement_overrides = {
      data: { plan_key: "business", features: null, limits: { ticket_commission_pct: 0 }, expires_at: null },
      error: null,
    };
    const e = await load();
    expect(await e.hasFeature("org", "business_mixer")).toBe(true);
    expect(await e.getTicketCommissionPct("org")).toBe(0);
  });

  it("limit uczestników: 75 zajętych miejsc na Free = limit osiągnięty", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    tables.plans = { data: plans, error: null };
    tables.attendees = { data: null, error: null, count: 75 } as never;
    const e = await load();
    expect(await e.isAttendeeLimitReached({ id: "ev", organization_id: "org" })).toBe(true);
  });

  it("błąd odczytu tabel → pełny dostęp (nie odcinamy organizatora)", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    tables.plans = { data: null, error: { message: "relation does not exist" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const e = await load();
    expect(await e.hasFeature("org", "business_mixer")).toBe(true);
  });
});
