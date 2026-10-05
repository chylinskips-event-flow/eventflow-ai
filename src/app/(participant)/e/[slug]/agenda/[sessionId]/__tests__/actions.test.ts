import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = {
  attendee: null as null | { id: string; event_id: string },
  event: { id: "ev1", organization_id: "org1", status: "live" } as { id: string; organization_id: string; status: string },
  session: { id: "s1", starts_at: "2020-01-01T10:00:00Z", speakers: [] } as null | {
    id: string;
    starts_at: string | null;
    speakers: { speaker: { id: string }; role: string }[];
  },
  liveQa: true,
};
vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => ctx.attendee }));
vi.mock("@/lib/events", () => ({ getEventBySlugForRegistration: async () => ctx.event }));
vi.mock("@/lib/sessions", () => ({ getEventSessionById: async () => ctx.session }));
vi.mock("@/lib/entitlements", () => ({ hasFeature: async () => ctx.liveQa }));

type Op = { table: string; op: string; payload?: unknown };
const ops: Op[] = [];
const rows: Record<string, unknown> = {};
let questionCount = 0;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          if (opts?.head) return { eq: () => ({ eq: async () => ({ count: questionCount }) }) };
          return b;
        },
        eq: () => b,
        maybeSingle: async () => ({ data: rows[table] ?? null }),
        insert: async (payload: unknown) => (ops.push({ table, op: "insert", payload }), { error: null }),
        upsert: async (payload: unknown) => (ops.push({ table, op: "upsert", payload }), { error: null }),
        delete: () => ({ eq: () => ({ eq: async () => (ops.push({ table, op: "delete" }), { error: null }) }) }),
      };
      return b;
    },
  }),
}));

const a = await import("../actions");
const idle = { status: "idle" as const };
const form = (v: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, val] of Object.entries(v)) fd.set(k, val);
  return fd;
};

beforeEach(() => {
  ops.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
  questionCount = 0;
  ctx.attendee = { id: "att1", event_id: "ev1" };
  ctx.event = { id: "ev1", organization_id: "org1", status: "live" };
  ctx.session = { id: "s1", starts_at: "2020-01-01T10:00:00Z", speakers: [] };
  ctx.liveQa = true;
});

describe("autoryzacja uczestnika", () => {
  it("bez cookie uczestnika → błąd, zero zapisów", async () => {
    ctx.attendee = null;
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x" }))).toMatchObject({ status: "error" });
    expect(await a.toggleQuestionVote("ev", "s1", "q1")).toMatchObject({ status: "error" });
    expect(await a.answerPoll("ev", "s1", "p1", "a")).toMatchObject({ status: "error" });
    expect(await a.rateSession("ev", "s1", idle, form({ rating: "5" }))).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
  });

  it("uczestnik innego eventu → błąd", async () => {
    ctx.attendee = { id: "att1", event_id: "inny" };
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x" }))).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
  });

  it("sesja spoza eventu → błąd", async () => {
    ctx.session = null;
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x" }))).toMatchObject({ status: "error", message: "Sesja nie istnieje." });
  });

  it("plan bez live_qa → funkcja niedostępna", async () => {
    ctx.liveQa = false;
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x" }))).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
  });
});

describe("pytania", () => {
  it("zapisuje pytanie z tożsamością z cookie i flagą anonimowości", async () => {
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "  Jak?  ", anonymous: "on" }))).toMatchObject({ status: "success" });
    expect(ops[0]).toEqual({
      table: "questions",
      op: "insert",
      payload: { session_id: "s1", attendee_id: "att1", content: "Jak?", is_anonymous: true, target_speaker_id: null },
    });
  });

  it("pytanie do panelisty: tylko prelegent tej sesji", async () => {
    ctx.session = { id: "s1", starts_at: null, speakers: [{ speaker: { id: "sp1" }, role: "speaker" }] };
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x", target_speaker_id: "sp-obcy" }))).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x", target_speaker_id: "sp1" }))).toMatchObject({ status: "success" });
    expect(ops[0]).toMatchObject({ payload: { target_speaker_id: "sp1" } });
  });

  it("limit pytań na sesję", async () => {
    questionCount = 10;
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x" }))).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
  });

  it("po zakończeniu eventu nie można pytać", async () => {
    ctx.event.status = "completed";
    expect(await a.askQuestion("ev", "s1", idle, form({ content: "x" }))).toMatchObject({ status: "error" });
  });

  it("nie można głosować na własne ani ukryte pytanie", async () => {
    rows.questions = { id: "q1", attendee_id: "att1", status: "pending" };
    expect(await a.toggleQuestionVote("ev", "s1", "q1")).toMatchObject({ status: "error" });
    rows.questions = { id: "q1", attendee_id: "att2", status: "hidden" };
    expect(await a.toggleQuestionVote("ev", "s1", "q1")).toMatchObject({ status: "error" });
    expect(ops).toHaveLength(0);
  });

  it("głos na cudze pytanie: insert; drugi klik: delete", async () => {
    rows.questions = { id: "q1", attendee_id: "att2", status: "pending" };
    await a.toggleQuestionVote("ev", "s1", "q1");
    expect(ops.at(-1)).toMatchObject({ table: "question_votes", op: "insert", payload: { question_id: "q1", attendee_id: "att1" } });
    rows.question_votes = { question_id: "q1" };
    await a.toggleQuestionVote("ev", "s1", "q1");
    expect(ops.at(-1)).toMatchObject({ table: "question_votes", op: "delete" });
  });
});

describe("ankiety i oceny", () => {
  it("odpowiedź tylko na otwartą ankietę i istniejącą opcję", async () => {
    rows.polls = { id: "p1", status: "closed", options: [{ id: "a", label: "A" }] };
    expect(await a.answerPoll("ev", "s1", "p1", "a")).toMatchObject({ status: "error" });
    rows.polls = { id: "p1", status: "open", options: [{ id: "a", label: "A" }] };
    expect(await a.answerPoll("ev", "s1", "p1", "zzz")).toMatchObject({ status: "error" });
    expect(await a.answerPoll("ev", "s1", "p1", "a")).toMatchObject({ status: "success" });
    expect(ops).toEqual([
      { table: "poll_answers", op: "upsert", payload: { poll_id: "p1", attendee_id: "att1", selected_option_id: "a" } },
    ]);
  });

  it("ocena: zakres 1–5, dopiero po starcie sesji", async () => {
    expect(await a.rateSession("ev", "s1", idle, form({ rating: "7" }))).toMatchObject({ status: "error" });
    ctx.session = { id: "s1", starts_at: "2999-01-01T10:00:00Z", speakers: [] };
    expect(await a.rateSession("ev", "s1", idle, form({ rating: "5" }))).toMatchObject({ status: "error" });
    ctx.session = { id: "s1", starts_at: "2020-01-01T10:00:00Z", speakers: [] };
    expect(await a.rateSession("ev", "s1", idle, form({ rating: "4", comment: " ok " }))).toMatchObject({ status: "success" });
    expect(ops).toEqual([
      { table: "feedback", op: "upsert", payload: { session_id: "s1", attendee_id: "att1", rating: 4, comment: "ok" } },
    ]);
  });
});
