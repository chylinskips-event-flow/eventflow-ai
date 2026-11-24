import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

// Grywalizacja: punkty doliczane atomowo w bazie, próby quizu stoiska rezerwowane atomowo
// (limit i przerwa sprawdzane w tym samym poleceniu, które zwiększa licznik).

const db = createDbMock();
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = (fn: string, args: Record<string, unknown>) => {
  rpcCalls.push({ fn, args });
  return rpcImpl(fn, args);
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ ...db.client, rpc }) }));

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261124110000_gamification_atomic_writes.sql"),
  "utf8",
);

const { completeQuest, computeLevel } = await import("@/lib/gamification");
const { quizAttemptRejection, MAX_QUIZ_ATTEMPTS, QUIZ_COOLDOWN_MS } = await import("@/lib/booth-visit");

beforeEach(() => {
  db.reset();
  rpcCalls.length = 0;
});

const baseParams = {
  attendeeId: "att1",
  questId: "q1",
  partnerId: null,
  answeredCorrectly: null,
  pointsAwarded: 30,
  leadConsent: false,
  consentTextVersion: null,
};

describe("completeQuest — punkty atomowo", () => {
  it("dolicza przez RPC add_attendee_points, bez odczytu i nadpisania punktów", async () => {
    rpcImpl = async () => ({ data: [{ new_points: 110, new_level: "connector" }], error: null });
    const r = await completeQuest(baseParams);
    expect(rpcCalls).toEqual([{ fn: "add_attendee_points", args: { p_attendee_id: "att1", p_delta: 30 } }]);
    expect(db.calls.some((c) => c.table === "attendees")).toBe(false);
    expect(r).toEqual({ ok: true, pointsAwarded: 30, newLevel: "connector", levelUp: true });
  });

  it("równoległe zaliczenia sumują się (baza liczy points = points + delta)", async () => {
    let points = 100;
    rpcImpl = async (_fn, args) => {
      await Promise.resolve();
      points += args.p_delta as number;
      return { data: [{ new_points: points, new_level: computeLevel(points) }], error: null };
    };
    await Promise.all([
      completeQuest({ ...baseParams, questId: "booth", pointsAwarded: 20 }),
      completeQuest({ ...baseParams, questId: "network", pointsAwarded: 50 }),
    ]);
    expect(points).toBe(170);
  });

  it("quest już zaliczony → bez doliczania punktów", async () => {
    db.results["quest_completions:insert"] = () => ({ data: null, error: { code: "23505" } });
    rpcImpl = async () => ({ data: null, error: null });
    expect(await completeQuest(baseParams)).toEqual({ ok: false, reason: "already_done" });
    expect(rpcCalls).toEqual([]);
  });

  it("błąd RPC jest zgłaszany, a nie przemilczany", async () => {
    rpcImpl = async () => ({ data: null, error: { message: "boom" } });
    await expect(completeQuest(baseParams)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("migracja add_attendee_points — progi poziomów zgodne z computeLevel", () => {
  const fn = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.add_attendee_points"));
  const thresholds = [...fn.matchAll(/>=\s*(\d+)\s+THEN\s+'(\w+)'/g)].map((m) => [Number(m[1]), m[2]] as const);

  it("każdy próg z SQL daje ten sam poziom w aplikacji", () => {
    expect(thresholds.length).toBe(3);
    for (const [min, level] of thresholds) {
      expect(computeLevel(min)).toBe(level);
      expect(computeLevel(min - 1)).not.toBe(level);
    }
    expect(computeLevel(0)).toBe("explorer");
  });

  it("aktualizacja względna (points = points + delta), tylko service_role", () => {
    expect(fn).toMatch(/SET\s+points\s*=\s*a\.points\s*\+\s*p_delta/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.add_attendee_points\(uuid, integer\) FROM PUBLIC, anon, authenticated/);
  });
});

describe("migracja claim_quiz_attempt", () => {
  const fn = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.claim_quiz_attempt"));

  it("limit i przerwa w warunku ON CONFLICT DO UPDATE (jedno polecenie)", () => {
    expect(fn).toMatch(/ON CONFLICT \(quest_id, attendee_id\) DO UPDATE/);
    expect(fn).toMatch(/WHERE q\.attempts < p_max_attempts/);
    expect(fn).toMatch(/last_attempt_at <= now\(\) - make_interval\(secs => p_cooldown_seconds\)/);
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_quiz_attempt\(uuid, uuid, integer, integer\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("lottery_exclusions: RLS włączone, bez polityk dla anon", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.lottery_exclusions ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).not.toMatch(/CREATE POLICY/i);
  });
});

describe("quizAttemptRejection — powód odrzucenia próby", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");

  it("limit wyczerpany → no_attempts", () => {
    expect(quizAttemptRejection({ attempts: MAX_QUIZ_ATTEMPTS, last_attempt_at: null }, now)).toEqual({
      status: "no_attempts",
    });
  });

  it("trwa przerwa → komunikat z liczbą minut", () => {
    const last = new Date(now - 3 * 60_000).toISOString();
    expect(quizAttemptRejection({ attempts: 1, last_attempt_at: last }, now)).toEqual({
      status: "error",
      message: "Porozmawiaj z zespołem stoiska i spróbuj ponownie za 7 min.",
    });
  });

  it("równoległa próba tuż po pierwszej → pełna przerwa", () => {
    const r = quizAttemptRejection({ attempts: 1, last_attempt_at: new Date(now).toISOString() }, now);
    expect(r).toMatchObject({ status: "error" });
    expect((r as { message: string }).message).toContain(`${QUIZ_COOLDOWN_MS / 60_000} min`);
  });
});

describe("quizAttemptRejection — różnica zegarów bazy i aplikacji", () => {
  it("znacznik próby „z przyszłości” nie wydłuża przerwy ponad 10 min", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    const future = new Date(now + 5 * 60_000).toISOString();
    expect(quizAttemptRejection({ attempts: 1, last_attempt_at: future }, now)).toEqual({
      status: "error",
      message: "Porozmawiaj z zespołem stoiska i spróbuj ponownie za 10 min.",
    });
  });
});
