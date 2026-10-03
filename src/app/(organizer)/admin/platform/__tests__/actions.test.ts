import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Atrapy ─────────────────────────────────────────────────────────────────
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Klient użytkownika (RLS): sesja + rpc is_platform_admin.
const session = { user: null as null | { id: string; email: string }, isAdmin: false };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    rpc: async (fn: string) =>
      fn === "is_platform_admin"
        ? { data: session.isAdmin, error: null }
        : { data: null, error: { message: "unexpected rpc" } },
  }),
}));

// Klient service_role: zapis operacji na tabelach.
type Op = { table: string; op: string; payload?: unknown };
const ops: Op[] = [];
const tables: Record<string, Record<string, unknown> | null> = {};
let auditFails = false;
const createAdminClient = vi.fn(() => ({
  from: (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      upsert: async (payload: unknown) => (ops.push({ table, op: "upsert", payload }), { error: null }),
      delete: () => ({
        eq: async () => (ops.push({ table, op: "delete" }), { error: null }),
      }),
      insert: async (payload: unknown) => {
        ops.push({ table, op: "insert", payload });
        return table === "super_admin_audit_log" && auditFails
          ? { error: { message: "audit down" } }
          : { error: null };
      },
    };
    return builder;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const actions = await import("../actions");

const ORG = "10000000-0000-0000-0000-000000000001";
const EVENT = "20000000-0000-0000-0000-000000000001";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const idle = { status: "idle" as const };

beforeEach(() => {
  ops.length = 0;
  createAdminClient.mockClear();
  auditFails = false;
  session.user = { id: "admin-uid", email: "admin@eventro.pl" };
  session.isAdmin = true;
  for (const k of Object.keys(tables)) delete tables[k];
  tables.plans = { key: "business" };
  tables.organizations = { id: ORG };
  tables.events = { id: EVENT, organization_id: ORG, slug: "ev1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("autoryzacja akcji panelu", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["setPlanOverride", () => actions.setPlanOverride(ORG, idle, form({ plan_key: "business", reason: "x" }))],
    ["removePlanOverride", () => actions.removePlanOverride(ORG)],
    ["suspendOrganization", () => actions.suspendOrganization(ORG, idle, form({ reason: "x" }))],
    ["unsuspendOrganization", () => actions.unsuspendOrganization(ORG)],
    ["suspendEvent", () => actions.suspendEvent(EVENT, idle, form({ reason: "x" }))],
    ["unsuspendEvent", () => actions.unsuspendEvent(EVENT)],
  ];

  for (const [name, call] of calls) {
    it(`${name}: bez sesji → 404, bez użycia service_role`, async () => {
      session.user = null;
      await expect(call()).rejects.toBeInstanceOf(NotFound);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it(`${name}: zalogowany organizator bez roli → 404, bez użycia service_role`, async () => {
      session.isAdmin = false;
      await expect(call()).rejects.toBeInstanceOf(NotFound);
      expect(createAdminClient).not.toHaveBeenCalled();
    });
  }
});

describe("setPlanOverride", () => {
  it("zapisuje override (nie subscriptions) i audyt", async () => {
    const res = await actions.setPlanOverride(
      ORG,
      idle,
      form({ plan_key: "business", reason: "pilot — grandfathering", ticket_commission_pct: "0" }),
    );
    expect(res).toEqual({ status: "success", message: "Override zapisany." });
    const upsert = ops.find((o) => o.op === "upsert");
    expect(upsert?.table).toBe("entitlement_overrides");
    expect(upsert?.payload).toMatchObject({
      organization_id: ORG,
      plan_key: "business",
      reason: "pilot — grandfathering",
      limits: { ticket_commission_pct: 0 },
      expires_at: null,
    });
    expect(ops.some((o) => o.table === "subscriptions")).toBe(false);
    const audit = ops.find((o) => o.table === "super_admin_audit_log");
    expect(audit?.payload).toMatchObject({
      actor_user_id: "admin-uid",
      action: "set_plan_override",
      target_type: "organization",
      target_id: ORG,
    });
  });

  it("wymaga powodu, odrzuca przeszłą datę i nieznany plan", async () => {
    expect(await actions.setPlanOverride(ORG, idle, form({ plan_key: "business" }))).toMatchObject({
      status: "error",
    });
    expect(
      await actions.setPlanOverride(ORG, idle, form({ plan_key: "business", reason: "x", expires_at: "2020-01-01" })),
    ).toMatchObject({ status: "error" });
    tables.plans = null;
    expect(await actions.setPlanOverride(ORG, idle, form({ plan_key: "hacker", reason: "x" }))).toMatchObject({
      status: "error",
      message: "Nieznany plan.",
    });
    expect(ops).toHaveLength(0);
  });

  it("nieprawidłowe ID organizacji → błąd bez zapisu", async () => {
    expect(await actions.setPlanOverride("1; drop table", idle, form({ plan_key: "business", reason: "x" }))).toMatchObject({
      status: "error",
    });
    expect(ops).toHaveLength(0);
  });

  it("awaria audytu → jasny komunikat (zmiana zapisana, audyt nie)", async () => {
    auditFails = true;
    const res = await actions.setPlanOverride(ORG, idle, form({ plan_key: "business", reason: "x" }));
    expect(res).toMatchObject({ status: "error" });
    expect(res.message).toContain("audytu");
  });
});

describe("zawieszenia", () => {
  it("zawieszenie eventu: tabela event_suspensions + audyt z powodem", async () => {
    await actions.suspendEvent(EVENT, idle, form({ reason: "spam" }));
    expect(ops[0]).toMatchObject({ table: "event_suspensions", op: "upsert" });
    expect(ops[1]).toMatchObject({
      table: "super_admin_audit_log",
      payload: { action: "suspend_event", details: { reason: "spam" } },
    });
  });

  it("zawieszenie konta wymaga powodu", async () => {
    expect(await actions.suspendOrganization(ORG, idle, form({}))).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
  });

  it("zdjęcie override: delete + audyt; subscriptions nietknięte", async () => {
    tables.entitlement_overrides = { plan_key: "business" };
    await actions.removePlanOverride(ORG);
    expect(ops.map((o) => `${o.table}:${o.op}`)).toEqual([
      "entitlement_overrides:delete",
      "super_admin_audit_log:insert",
    ]);
  });
});
