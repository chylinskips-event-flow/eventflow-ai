import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

const db = createDbMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

const EVENT = "event-1";
const attendee = { current: { id: "att-1", event_id: EVENT } as { id: string; event_id: string } | null };
vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => attendee.current }));

const { pickMixerForAttendee, getMixerForAttendee, hasActiveMixerForAttendee } = await import(
  "@/lib/mixer/participant"
);

const mx = (id: string, status: string, updated_at = "2026-11-01T10:00:00Z", created_at = "2026-11-01T09:00:00Z") => ({
  id,
  status,
  updated_at,
  created_at,
});

describe("pickMixerForAttendee — uczestnik w kilku mikserach eventu", () => {
  it("brak widocznych → null", () => {
    expect(pickMixerForAttendee([])).toBeNull();
    expect(pickMixerForAttendee([mx("a", "draft")])).toBeNull();
  });

  it("trwający mixer ma pierwszeństwo przed przygotowanym i zakończonym", () => {
    const picked = pickMixerForAttendee([
      mx("fin", "finished", "2026-11-03T00:00:00Z"),
      mx("gen", "generated", "2026-11-02T00:00:00Z"),
      mx("run", "running", "2026-11-01T00:00:00Z"),
    ]);
    expect(picked?.id).toBe("run");
  });

  it("przygotowany przed zakończonym; w grupie — ostatnio aktualizowany", () => {
    expect(pickMixerForAttendee([mx("fin", "finished", "2026-11-05T00:00:00Z"), mx("lock", "locked")])?.id).toBe("lock");
    expect(
      pickMixerForAttendee([
        mx("old", "generated", "2026-11-01T00:00:00Z"),
        mx("new", "locked", "2026-11-02T00:00:00Z"),
      ])?.id,
    ).toBe("new");
  });

  it("wynik nie zależy od kolejności wejścia", () => {
    const a = mx("a", "generated");
    const b = mx("b", "generated");
    expect(pickMixerForAttendee([a, b])?.id).toBe(pickMixerForAttendee([b, a])?.id);
  });
});

describe("getMixerForAttendee / hasActiveMixerForAttendee — dwa miksery", () => {
  beforeEach(() => {
    db.reset();
    attendee.current = { id: "att-1", event_id: EVENT };
    db.results["mixer_participants:select"] = (c) => {
      const byAttendee = c.filters.some(([k]) => k === "attendee_id");
      if (byAttendee) {
        return {
          data: [
            { id: "p-old", mixer_id: "m-old" },
            { id: "p-live", mixer_id: "m-live" },
          ],
          error: null,
        };
      }
      return {
        data: [
          { id: "p-live", display_name: "Ja", company: null },
          { id: "p-x", display_name: "Ola", company: "ACME" },
        ],
        error: null,
      };
    };
    db.results["mixers:select"] = () => ({
      data: [
        {
          id: "m-old", name: "Poranny", event_id: EVENT, status: "finished", rounds_count: 1,
          round_minutes: 10, break_minutes: 0, break_after_round: null,
          updated_at: "2026-11-01T12:00:00Z", created_at: "2026-11-01T08:00:00Z",
        },
        {
          id: "m-live", name: "Popołudniowy", event_id: EVENT, status: "running", rounds_count: 1,
          round_minutes: 15, break_minutes: 0, break_after_round: null,
          updated_at: "2026-11-01T11:00:00Z", created_at: "2026-11-01T09:00:00Z",
        },
      ],
      error: null,
    });
    db.results["mixer_assignments:select"] = (c) => {
      const own = c.filters.some(([k]) => k === "participant_id");
      return {
        data: own
          ? [{ round_number: 1, table_number: 2 }]
          : [
              { round_number: 1, table_number: 2, participant_id: "p-live" },
              { round_number: 1, table_number: 2, participant_id: "p-x" },
            ],
        error: null,
      };
    };
    db.results["mixer_icebreakers:select"] = () => ({ data: [], error: null });
    db.results["mixer_rounds:select"] = () => ({
      data: [{ round_number: 1, status: "active", started_at: "2026-11-01T11:00:00Z" }],
      error: null,
    });
  });

  it("widok działa i pokazuje trwający mixer", async () => {
    const data = await getMixerForAttendee("slug");
    expect(data).not.toBeNull();
    expect(data?.mixerName).toBe("Popołudniowy");
    expect(data?.isLive).toBe(true);
    expect(data?.rounds[0].tablemates).toEqual([{ display_name: "Ola", company: "ACME" }]);
    // zapytania o plan dotyczą wybranego mixera
    const assignmentQ = db.calls.find(
      (c) => c.table === "mixer_assignments" && c.filters.some(([k]) => k === "participant_id"),
    );
    expect(assignmentQ?.filters).toEqual(expect.arrayContaining([["mixer_id", "m-live"], ["participant_id", "p-live"]]));
    // mixer zawężony do eventu uczestnika
    const mixersQ = db.calls.find((c) => c.table === "mixers");
    expect(mixersQ?.filters).toEqual(expect.arrayContaining([["event_id", EVENT]]));
  });

  it("kafelek mixera widoczny mimo dwóch wpisów", async () => {
    await expect(hasActiveMixerForAttendee("att-1")).resolves.toBe(true);
  });

  it("brak wpisów → brak mixera", async () => {
    db.results["mixer_participants:select"] = () => ({ data: [], error: null });
    await expect(hasActiveMixerForAttendee("att-1")).resolves.toBe(false);
    await expect(getMixerForAttendee("slug")).resolves.toBeNull();
  });
});
