import { describe, it, expect, vi, beforeEach } from "vitest";

// Stary checkbox zgody leadowej vs Faza B (PARTNER_LEADS_ENABLED): przy włączonej fladze
// odwiedziny/punkty działają, ale nie przekazują danych partnerowi.

const ctx = { leadsV2: false, quest: null as null | Record<string, unknown> };
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
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === "quests" ? ctx.quest : null }),
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
const consentForm = () => {
  const fd = new FormData();
  fd.set("lead_consent", "on");
  return fd;
};
const leadUpdates = () => ops.filter((o) => o.table === "checkins" && o.op === "update");

beforeEach(() => {
  ops.length = 0;
  completeQuest.mockClear();
  ctx.quest = null;
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
    const res = await submitBoothVisit("expo", "tok", idle, consentForm());
    expect(res).toMatchObject({ status: "success", pointsAwarded: 10 });
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ leadConsent: false, consentTextVersion: null }));
  });

  it("flaga wyłączona, quest booth_visit: leadConsent=true (jak dotąd)", async () => {
    ctx.leadsV2 = false;
    ctx.quest = { id: "q1", type: "booth_visit", title: "Odwiedź", points_value: 10, config: null };
    await submitBoothVisit("expo", "tok", idle, consentForm());
    expect(completeQuest).toHaveBeenCalledWith(expect.objectContaining({ leadConsent: true }));
  });
});
