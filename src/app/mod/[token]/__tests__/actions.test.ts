import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = {
  link: { id: "l1", room: "Sala A" as string | null },
  valid: true,
  sessionRooms: {} as Record<string, string | null>,
};
vi.mock("@/lib/moderator", () => ({
  resolveModeratorLink: async () =>
    ctx.valid ? { link: ctx.link, event: { id: "ev1", organization_id: "org1" } } : null,
  getSessionInScope: async (c: { link: { room: string | null } }, sessionId: string) => {
    if (!(sessionId in ctx.sessionRooms)) return null;
    const room = ctx.sessionRooms[sessionId];
    return c.link.room === null || room === c.link.room ? { id: sessionId, room } : null;
  },
}));

const mutations: { fn: string; args: unknown[] }[] = [];
vi.mock("@/lib/engagement-mutations", () => ({
  updateQuestionStatus: async (...args: unknown[]) => (mutations.push({ fn: "q", args }), { ok: true }),
  updatePollStatus: async (...args: unknown[]) => (mutations.push({ fn: "p", args }), { ok: true }),
  insertPollFromForm: async (...args: unknown[]) => (mutations.push({ fn: "new", args }), { ok: true }),
}));

const rows: Record<string, unknown> = {};
const updates: { table: string; payload: unknown }[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: rows[table] ?? null }),
        update: (payload: unknown) => ({
          eq: async () => (updates.push({ table, payload }), { error: null }),
        }),
      };
      return b;
    },
  }),
}));

const a = await import("../actions");
const idle = { status: "idle" as const };
const Q = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const AL = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  ctx.valid = true;
  ctx.link = { id: "l1", room: "Sala A" };
  ctx.sessionRooms = { sA: "Sala A", sB: "Sala B" };
  mutations.length = 0;
  updates.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
});

describe("token prowadzącego", () => {
  it("nieważny / unieważniony token → błąd, zero zapisów", async () => {
    ctx.valid = false;
    rows.questions = { id: Q, session_id: "sA" };
    expect(await a.moderatorSetQuestionStatus("t", Q, "selected")).toMatchObject({ status: "error" });
    expect(await a.moderatorCreatePoll("t", "sA", idle, new FormData())).toMatchObject({ status: "error" });
    expect(await a.moderatorSetPollStatus("t", P, "open")).toMatchObject({ status: "error" });
    expect(await a.moderatorSetAlertAnnounced("t", AL, true)).toMatchObject({ status: "error" });
    expect(mutations).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

describe("zakres sali", () => {
  it("pytanie z innej sali → błąd", async () => {
    rows.questions = { id: Q, session_id: "sB" };
    expect(await a.moderatorSetQuestionStatus("t", Q, "selected")).toMatchObject({ status: "error" });
    expect(mutations).toHaveLength(0);
  });

  it("pytanie ze swojej sali → zmiana statusu", async () => {
    rows.questions = { id: Q, session_id: "sA" };
    expect(await a.moderatorSetQuestionStatus("t", Q, "selected")).toMatchObject({ status: "success" });
    expect(mutations[0]).toEqual({ fn: "q", args: [Q, "sA", "selected"] });
  });

  it("ankieta w sesji innej sali → błąd; link „wszystkie sale” → OK", async () => {
    rows.polls = { id: P, session_id: "sB" };
    expect(await a.moderatorSetPollStatus("t", P, "open")).toMatchObject({ status: "error" });
    ctx.link = { id: "l1", room: null };
    expect(await a.moderatorSetPollStatus("t", P, "open")).toMatchObject({ status: "success" });
  });

  it("nowa ankieta: od razu otwarta albo szkic; obca sesja → błąd", async () => {
    const fd = new FormData();
    fd.set("open_now", "on");
    await a.moderatorCreatePoll("t", "sA", idle, fd);
    expect(mutations[0].args[0]).toBe("ev1");
    expect(mutations[0].args[3]).toBe("open");
    await a.moderatorCreatePoll("t", "sA", idle, new FormData());
    expect(mutations[1].args[3]).toBe("draft");
    expect(await a.moderatorCreatePoll("t", "sB", idle, fd)).toMatchObject({ status: "error" });
    expect(mutations).toHaveLength(2);
  });
});

describe("komunikaty", () => {
  it("komunikat innej sali → błąd", async () => {
    rows.event_alerts = { id: AL, room: "Sala B" };
    expect(await a.moderatorSetAlertAnnounced("t", AL, true)).toMatchObject({ status: "error" });
    expect(updates).toHaveLength(0);
  });

  it("ogłoszenie zapisuje czas i link; cofnięcie czyści", async () => {
    rows.event_alerts = { id: AL, room: null };
    await a.moderatorSetAlertAnnounced("t", AL, true);
    expect(updates[0].payload).toMatchObject({ announced_via: "l1" });
    expect((updates[0].payload as { announced_at: string }).announced_at).toBeTruthy();
    await a.moderatorSetAlertAnnounced("t", AL, false);
    expect(updates[1].payload).toEqual({ announced_at: null, announced_via: null });
  });
});
