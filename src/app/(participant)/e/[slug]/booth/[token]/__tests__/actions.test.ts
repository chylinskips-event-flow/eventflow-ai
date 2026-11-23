import { describe, it, expect, vi, beforeEach } from "vitest";

// Stary checkbox zgody leadowej vs Faza B (PARTNER_LEADS_ENABLED): przy włączonej fladze
// odwiedziny/punkty działają, ale nie przekazują danych partnerowi.

const ctx = {
  leadsV2: false,
  gamification: true,
  quest: null as null | Record<string, unknown>,
  quests: null as null | Record<string, unknown>[],
  completedIds: [] as string[],
};
const ops: { table: string; op: string; payload?: unknown }[] = [];
type QuestParams = { leadConsent: boolean; consentTextVersion: string | null };
const completeQuest = vi.fn<(p: QuestParams) => Promise<{ ok: true; pointsAwarded: number; newLevel: string; levelUp: boolean }>>(
  async () => ({ ok: true, pointsAwarded: 10, newLevel: "explorer", levelUp: false }),
);

vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => ({ id: "att1", level: "explorer" }) }));
vi.mock("@/lib/partners", () => ({
  getPartnerByTokenAndEventSlug: async () => ({ id: "p1", event_id: "ev1", name: "Acme" }),
}));
vi.mock("@/lib/gamification", () => ({ completeQuest: (p: never) => completeQuest(p) }));
vi.mock("@/lib/partner-leads", () => ({ isPartnerLeadsEnabled: () => ctx.leadsV2 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const list = () => {
        if (table === "quests") return ctx.quests ?? (ctx.quest ? [ctx.quest] : []);
        if (table === "quest_completions") return ctx.completedIds.map((quest_id) => ({ quest_id }));
        return null;
      };
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        maybeSingle: async () => ({
          data: table === "events" ? { gamification_enabled: ctx.gamification } : null,
        }),
        then: (resolve: (r: { data: unknown }) => unknown) => Promise.resolve({ data: list() }).then(resolve),
        upsert: async (payload: unknown) => (ops.push({ table, op: "upsert", payload }), { error: null }),
        insert: async (payload: unknown) => (ops.push({ table, op: "insert", payload }), { error: null }),
        update: (payload: unknown) => (ops.push({ table, op: "update", payload }), b),
      };
      return b;
    },
  }),
}));

const { submitBoothVisit } = await import("../actions");
const idle = { status: "idle" as const };
const consentForm = (questId?: string) => {
  const fd = new FormData();
  fd.set("lead_consent", "on");
  if (questId) fd.set("quest_id", questId);
  return fd;
};
const questForm = (questId: string) => {
  const fd = new FormData();
  fd.set("quest_id", questId);
  return fd;
};
const leadUpdates = () => ops.filter((o) => o.table === "checkins" && o.op === "update");

beforeEach(() => {
  ops.length = 0;
  completeQuest.mockClear();
  ctx.quest = null;
  ctx.quests = null;
  ctx.completedIds = [];
  ctx.gamification = true;
});

describe("submitBoothVisit — zgoda leadowa a flaga Fazy B", () => {
  it("flaga wyłączona, bez questa: checkbox ustawia lead_consent_given (jak dotąd)", async () => {
    ctx.leadsV2 = false;
    const res = await submitBoothVisit("expo", "tok", idle, consentForm());
    expect(res.status).toBe("success");
    expect(leadUpdates()).toHaveLength(1);
  });

  it("flaga włączona, bez questa: check-in jest, leada nie ma (pole z formularza ignorowane)", async () => {
    ctx.leadsV2 = true;
    const res = await submitBoothVisit("expo", "tok", idle, consentForm());
    expect(res.status).toBe("success");
    expect(ops.some((o) => o.table === "checkins" && o.op === "upsert")).toBe(true);
    expect(leadUpdates()).toHaveLength(0);
  });

  it("flaga włączona, quest booth_visit: punkty naliczone, leadConsent=false", async () => {
    ctx.leadsV2 = true;
    ctx.quest = { id: "q1", type: "booth_visit", title: "Odwiedź", points_value: 10, config: null };
    const res = await submitBoothVisit("expo", "tok", idle, consentForm("q1"));
    expect(res).toMatchObject({ status: "success", pointsAwarded: 10 });
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ leadConsent: false, consentTextVersion: null }));
  });

  it("flaga wyłączona, quest booth_visit: leadConsent=true (jak dotąd)", async () => {
    ctx.leadsV2 = false;
    ctx.quest = { id: "q1", type: "booth_visit", title: "Odwiedź", points_value: 10, config: null };
    await submitBoothVisit("expo", "tok", idle, consentForm("q1"));
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ leadConsent: true }));
  });
});

describe("submitBoothVisit — grywalizacja wyłączona", () => {
  it("aktywny quest booth_visit, ale grywalizacja wyłączona: check-in bez punktów i bez questa", async () => {
    ctx.leadsV2 = false;
    ctx.gamification = false;
    ctx.quest = { id: "q1", type: "booth_visit", title: "Odwiedź", points_value: 10, config: null };
    const res = await submitBoothVisit("expo", "tok", idle, new FormData());
    expect(res).toMatchObject({ status: "success", pointsAwarded: 0 });
    expect(completeQuest).not.toHaveBeenCalled();
    expect(ops.some((o) => o.table === "checkins" && o.op === "upsert")).toBe(true);
    expect(ops.some((o) => o.table === "quiz_attempts")).toBe(false);
  });

  it("grywalizacja wyłączona, quest z hasłem: odpowiedź nie jest oceniana ani liczona jako próba", async () => {
    ctx.gamification = false;
    ctx.quest = { id: "q1", type: "booth_password", title: "Hasło", points_value: 20, config: { password: "x" } };
    const fd = new FormData();
    fd.set("password", "x");
    const res = await submitBoothVisit("expo", "tok", idle, fd);
    expect(res).toMatchObject({ status: "success", pointsAwarded: 0 });
    expect(completeQuest).not.toHaveBeenCalled();
    expect(ops.some((o) => o.table === "quiz_attempts")).toBe(false);
  });
});

describe("submitBoothVisit — kilka aktywnych questów jednego partnera", () => {
  const visitA = { id: "qa", type: "booth_visit", title: "A", points_value: 10, config: null };
  const visitB = { id: "qb", type: "booth_visit", title: "B", points_value: 15, config: null };

  it("dwa aktywne questy: zaliczany pierwszy niezaliczony (nie zwykły check-in bez punktów)", async () => {
    ctx.quests = [visitA, visitB];
    await submitBoothVisit("expo", "tok", idle, questForm("qa"));
    expect(completeQuest).toHaveBeenCalledTimes(1);
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ questId: "qa", pointsAwarded: 10 }));
  });

  it("pierwszy już zaliczony → kolejna wizyta zalicza drugi quest niezależnie", async () => {
    ctx.quests = [visitA, visitB];
    ctx.completedIds = ["qa"];
    await submitBoothVisit("expo", "tok", idle, questForm("qb"));
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ questId: "qb", pointsAwarded: 15 }));
  });
});

describe("submitBoothVisit — formularz wyrenderowany dla innego questa", () => {
  const quizA = {
    id: "qa",
    type: "booth_quiz",
    title: "Quiz A",
    points_value: 10,
    config: { question: "?", options: [{ id: "o1", label: "1" }], correct_id: "o1" },
  };
  const quizB = {
    id: "qb",
    type: "booth_quiz",
    title: "Quiz B",
    points_value: 20,
    config: { question: "?", options: [{ id: "o1", label: "1" }], correct_id: "o1" },
  };

  it("bieżący quest inny niż w formularzu: błąd, bez oceny i bez zużycia prób", async () => {
    ctx.quests = [quizA, quizB];
    ctx.completedIds = ["qa"]; // bieżący to już qb, formularz był dla qa
    const fd = questForm("qa");
    fd.set("answer_id", "o1");
    const res = await submitBoothVisit("expo", "tok", idle, fd);
    expect(res).toEqual({ status: "error", message: "Stoisko zmieniło zadanie — odśwież stronę." });
    expect(completeQuest).not.toHaveBeenCalled();
    expect(ops.some((o) => o.table === "quiz_attempts")).toBe(false);
    expect(ops.some((o) => o.table === "checkins")).toBe(false);
  });

  it("formularz bez questa, a teraz jest aktywny quest: błąd, nic nie zapisane", async () => {
    ctx.quests = [quizB];
    const res = await submitBoothVisit("expo", "tok", idle, new FormData());
    expect(res.status).toBe("error");
    expect(completeQuest).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
  });

  it("formularz z questem, który przestał być aktywny: błąd zamiast check-inu", async () => {
    ctx.quests = [];
    const res = await submitBoothVisit("expo", "tok", idle, questForm("qa"));
    expect(res.status).toBe("error");
    expect(ops).toHaveLength(0);
  });

  it("zgodny quest: odpowiedź oceniana i próba zapisana", async () => {
    ctx.quests = [quizA, quizB];
    const fd = questForm("qa");
    fd.set("answer_id", "o1");
    const res = await submitBoothVisit("expo", "tok", idle, fd);
    expect(res).toMatchObject({ status: "success" });
    expect(ops.some((o) => o.table === "quiz_attempts" && (o.payload as { quest_id: string }).quest_id === "qa")).toBe(true);
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ questId: "qa", answeredCorrectly: true, pointsAwarded: 10 }));
  });
});
