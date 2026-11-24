import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock, type DbCall } from "@/lib/__tests__/helpers/db-mock";

// Kilka aktywnych questów tego samego typu w jednym evencie — każdy oceniany niezależnie
// (wcześniej drugi quest tego typu wyłączał zaliczanie wszystkich).

const db = createDbMock();
// Punkty doliczane atomowo przez RPC add_attendee_points (points = points + delta).
let points = 0;
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const rpc = async (fn: string, args: Record<string, unknown>) => {
  rpcCalls.push({ fn, args });
  points += args.p_delta as number;
  return { data: [{ new_points: points, new_level: "explorer" }], error: null };
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ ...db.client, rpc }) }));

const { checkNetworkingQuestProgress, checkProfileQuestProgress } = await import("@/lib/gamification");

const ok = (data: unknown, extra: Record<string, unknown> = {}) => () => ({ data, error: null, ...extra });
const completions = () =>
  db.calls
    .filter((c) => c.table === "quest_completions" && c.op === "insert")
    .map((c) => c.payload as { quest_id: string; points_awarded: number });
const pointsUpdates = () => rpcCalls.map(() => points);

function setup(opts: {
  enabled?: boolean;
  quests: { id: string; points_value: number; target_value?: number | null }[];
  done?: string[];
  contacts?: number;
  profileComplete?: boolean;
}) {
  db.reset();
  points = 0;
  rpcCalls.length = 0;
  db.results["events:select"] = ok({ gamification_enabled: opts.enabled ?? true });
  db.results["quests:select"] = ok(opts.quests.map((q) => ({ target_value: null, ...q })));
  db.results["quest_completions:select"] = ok((opts.done ?? []).map((quest_id) => ({ quest_id })));
  db.results["contact_requests:select"] = () => ({ data: null, error: null, count: opts.contacts ?? 0 }) as never;
  db.results["attendees:select"] = (c: DbCall) =>
    c.filters.some(([k]) => k === "id")
      ? {
          data: opts.profileComplete === undefined
            ? { points }
            : {
                points,
                company: "Acme",
                job_title: "CTO",
                industry: "IT",
                interests: opts.profileComplete ? ["AI"] : [],
                goal: "networking",
              },
          error: null,
        }
      : { data: null, error: null };
}

beforeEach(() => db.reset());

describe("networking_contacts — kilka aktywnych questów", () => {
  it("dwa questy z różnymi progami: zalicza każdy, którego próg osiągnięto", async () => {
    setup({
      quests: [
        { id: "n3", points_value: 10, target_value: 3 },
        { id: "n5", points_value: 30, target_value: 5 },
      ],
      contacts: 3,
    });
    await checkNetworkingQuestProgress("att1", "ev1");
    expect(completions().map((c) => c.quest_id)).toEqual(["n3"]);
  });

  it("próg obu osiągnięty: oba zaliczone, punkty zsumowane", async () => {
    setup({
      quests: [
        { id: "n3", points_value: 10, target_value: 3 },
        { id: "n5", points_value: 30, target_value: 5 },
      ],
      contacts: 5,
    });
    await checkNetworkingQuestProgress("att1", "ev1");
    expect(completions().map((c) => c.quest_id)).toEqual(["n3", "n5"]);
    expect(pointsUpdates().at(-1)).toBe(40);
  });

  it("jeden już zaliczony → drugi oceniany niezależnie", async () => {
    setup({
      quests: [
        { id: "n3", points_value: 10, target_value: 3 },
        { id: "n5", points_value: 30, target_value: 5 },
      ],
      done: ["n3"],
      contacts: 5,
    });
    await checkNetworkingQuestProgress("att1", "ev1");
    expect(completions().map((c) => c.quest_id)).toEqual(["n5"]);
  });

  it("grywalizacja wyłączona → nic", async () => {
    setup({ enabled: false, quests: [{ id: "n1", points_value: 10, target_value: 1 }], contacts: 5 });
    await checkNetworkingQuestProgress("att1", "ev1");
    expect(completions()).toEqual([]);
  });
});

describe("profile_complete — kilka aktywnych questów", () => {
  it("kompletny profil: zalicza oba questy", async () => {
    setup({
      quests: [
        { id: "p1", points_value: 20 },
        { id: "p2", points_value: 5 },
      ],
      profileComplete: true,
    });
    await checkProfileQuestProgress("att1", "ev1");
    expect(completions().map((c) => c.quest_id)).toEqual(["p1", "p2"]);
  });

  it("niekompletny profil: żaden", async () => {
    setup({ quests: [{ id: "p1", points_value: 20 }, { id: "p2", points_value: 5 }], profileComplete: false });
    await checkProfileQuestProgress("att1", "ev1");
    expect(completions()).toEqual([]);
  });
});
