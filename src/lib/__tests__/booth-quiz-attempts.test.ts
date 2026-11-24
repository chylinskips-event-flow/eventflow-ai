import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

// Quiz / hasło stoiska: próba jest rezerwowana w bazie (claim_quiz_attempt) przed oceną,
// więc równoległe wysłania nie omijają limitu prób ani przerwy między próbami.

const db = createDbMock();

// Symulacja claim_quiz_attempt: jeden wiersz na (quest, uczestnik), operacje szeregowane
// jak przy blokadzie wiersza w Postgresie.
const attempts = new Map<string, { attempts: number; last: number }>();
let now = Date.parse("2026-11-24T12:00:00Z");
const rpc = async (fn: string, a: Record<string, unknown>) => {
  if (fn !== "claim_quiz_attempt") return { data: null, error: { message: "unknown rpc" } };
  const key = `${a.p_quest_id}:${a.p_attendee_id}`;
  const row = attempts.get(key);
  if (!row) {
    attempts.set(key, { attempts: 1, last: now });
    return { data: 1, error: null };
  }
  const cooldownOver = now - row.last >= (a.p_cooldown_seconds as number) * 1000;
  if (row.attempts < (a.p_max_attempts as number) && (row.attempts === 0 || cooldownOver)) {
    row.attempts += 1;
    row.last = now;
    return { data: row.attempts, error: null };
  }
  return { data: null, error: null };
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ ...db.client, rpc }) }));

const completeQuest = vi.fn(async (p: { pointsAwarded: number }) => ({
  ok: true as const,
  pointsAwarded: p.pointsAwarded,
  newLevel: "explorer" as const,
  levelUp: false,
}));
vi.mock("@/lib/gamification", () => ({ completeQuest: (p: { pointsAwarded: number }) => completeQuest(p) }));
vi.mock("@/lib/attendee-session", () => ({
  getCurrentAttendee: async () => ({ id: "att1", level: "explorer" }),
}));
vi.mock("@/lib/partners", () => ({
  getPartnerByTokenAndEventSlug: async () => ({ id: "p1", event_id: "ev1", name: "Acme" }),
}));
let quest: Record<string, unknown> = {};
vi.mock("@/lib/booth-quest", () => ({ getCurrentBoothQuest: async () => quest }));
vi.mock("@/lib/partner-leads", () => ({ isPartnerLeadsEnabled: () => false }));

const { submitBoothVisit } = await import("@/app/(participant)/e/[slug]/booth/[token]/actions");

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const submit = (fields: Record<string, string>) =>
  submitBoothVisit("expo", "tok", { status: "idle" }, form({ quest_id: "q1", ...fields }));

beforeEach(() => {
  db.reset();
  attempts.clear();
  completeQuest.mockClear();
  now = Date.now();
  quest = { id: "q1", type: "booth_quiz", points_value: 40, config: { correct_id: "c" } };
  db.results["events:select"] = () => ({ data: { gamification_enabled: true }, error: null });
  db.results["quiz_attempts:select"] = () => {
    const row = attempts.get("q1:att1");
    return {
      data: row ? { attempts: row.attempts, last_attempt_at: new Date(row.last).toISOString() } : null,
      error: null,
    };
  };
});

describe("submitBoothVisit — limit prób quizu", () => {
  it("równoległe wysłanie wszystkich odpowiedzi: oceniona tylko jedna, reszta odrzucona", async () => {
    const results = await Promise.all(["a", "b", "c", "d"].map((answer_id) => submit({ answer_id })));
    const graded = results.filter((r) => r.status === "success" || r.status === "wrong_answer");
    expect(graded).toHaveLength(1);
    expect(results.filter((r) => r.status === "error")).toHaveLength(3);
    expect(attempts.get("q1:att1")?.attempts).toBe(1);
    // Punkty co najwyżej raz
    expect(completeQuest.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("pierwsza próba poprawna → pełne punkty", async () => {
    expect(await submit({ answer_id: "c" })).toMatchObject({ status: "success", pointsAwarded: 40 });
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ pointsAwarded: 40, answeredCorrectly: true }));
  });

  it("błędna → przerwa → druga próba poprawna za połowę punktów", async () => {
    expect(await submit({ answer_id: "a" })).toEqual({ status: "wrong_answer", attemptsUsed: 1 });
    expect(await submit({ answer_id: "c" })).toMatchObject({
      status: "error",
      message: "Porozmawiaj z zespołem stoiska i spróbuj ponownie za 10 min.",
    });
    now += 10 * 60_000;
    expect(await submit({ answer_id: "c" })).toMatchObject({ status: "success", pointsAwarded: 20 });
  });

  it("dwie błędne → ukończenie z 0 pkt, kolejne wysłania → no_attempts", async () => {
    await submit({ answer_id: "a" });
    now += 10 * 60_000;
    expect(await submit({ answer_id: "b" })).toEqual({ status: "no_attempts" });
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ pointsAwarded: 0, answeredCorrectly: false }));
    now += 60 * 60_000;
    expect(await submit({ answer_id: "c" })).toEqual({ status: "no_attempts" });
    expect(completeQuest).toHaveBeenCalledTimes(1);
  });

  it("hasło stoiska: ten sam mechanizm prób", async () => {
    quest = { id: "q1", type: "booth_password", points_value: 10, config: { password: "Kawa" } };
    const results = await Promise.all(["x", "y", "kawa"].map((password) => submit({ password })));
    expect(results.filter((r) => r.status === "error")).toHaveLength(2);
    expect(attempts.get("q1:att1")?.attempts).toBe(1);
  });

  it("nie zapisuje licznika prób z aplikacji (brak upsert do quiz_attempts)", async () => {
    await submit({ answer_id: "a" });
    expect(db.calls.some((c) => c.table === "quiz_attempts" && c.op !== "select")).toBe(false);
  });
});
