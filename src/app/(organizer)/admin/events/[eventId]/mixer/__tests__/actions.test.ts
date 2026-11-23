import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

const db = createDbMock();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

const EVENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MIXER = "11111111-1111-4111-8111-111111111111";
const FOREIGN_MIXER = "22222222-2222-4222-8222-222222222222";
const PARTICIPANT = "33333333-3333-4333-8333-333333333333";
const ICEBREAKER = "44444444-4444-4444-8444-444444444444";

const auth = { ownsEvent: true };
vi.mock("@/lib/events", () => ({
  getOwnEvent: async () => (auth.ownsEvent ? { id: EVENT, organization_id: "org1" } : null),
}));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));

const {
  nextRound,
  resetLive,
  setParticipantStatus,
  addParticipants,
  updateIcebreaker,
  replaceIcebreaker,
  updateParams,
} = await import("../actions");

const state = { mixerStatus: "running" };

beforeEach(() => {
  db.reset();
  auth.ownsEvent = true;
  state.mixerStatus = "running";
  // Mixer istnieje tylko w TYM evencie (zapytanie filtruje po id i event_id).
  db.results["mixers:select"] = (c) => {
    const id = c.filters.find(([k]) => k === "id")?.[1];
    const ev = c.filters.find(([k]) => k === "event_id")?.[1];
    return { data: id === MIXER && ev === EVENT ? { status: state.mixerStatus } : null, error: null };
  };
  db.results["mixer_rounds:select"] = () => ({ data: { id: "r1", round_number: 1 }, error: null });
});

const params = () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    table_count: "2", seat_min: "2", seat_max: "4", rounds_count: "3",
    round_minutes: "10", break_minutes: "5", break_after_round: "",
  })) f.set(k, v);
  return f;
};

describe("akcje Mixera — mixer musi należeć do eventu organizatora", () => {
  it("cudzy mixer: nextRound i resetLive nic nie zapisują", async () => {
    await expect(nextRound(FOREIGN_MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    await expect(resetLive(FOREIGN_MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    expect(db.writes()).toEqual([]);
  });

  it("cudzy mixer: zmiana statusu i dodawanie uczestników odrzucone", async () => {
    state.mixerStatus = "draft";
    await expect(setParticipantStatus(PARTICIPANT, FOREIGN_MIXER, EVENT, "absent")).resolves.toMatchObject({
      status: "error",
      message: "Mixer nie znaleziony.",
    });
    await expect(addParticipants(FOREIGN_MIXER, EVENT, ["a1"])).resolves.toMatchObject({ status: "error" });
    await expect(updateParams(FOREIGN_MIXER, EVENT, { status: "idle" }, params())).resolves.toMatchObject({
      status: "error",
    });
    expect(db.writes()).toEqual([]);
  });

  it("cudzy mixer: edycja i wymiana ice-breakera odrzucone", async () => {
    await expect(updateIcebreaker(ICEBREAKER, FOREIGN_MIXER, EVENT, "Pytanie?")).resolves.toMatchObject({
      status: "error",
    });
    await expect(replaceIcebreaker(ICEBREAKER, FOREIGN_MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    expect(db.writes()).toEqual([]);
  });

  it("brak własności eventu → nic nie zapisuje", async () => {
    auth.ownsEvent = false;
    await expect(nextRound(MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    await expect(resetLive(MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    expect(db.calls).toEqual([]);
  });

  it("własny, trwający mixer: nextRound zamyka aktywną rundę", async () => {
    const res = await nextRound(MIXER, EVENT);
    expect(res.status).toBe("success");
    expect(db.writes().some((c) => c.table === "mixer_rounds" && c.op === "update")).toBe(true);
  });

  it("nextRound wymaga uruchomionego mixera", async () => {
    state.mixerStatus = "generated";
    await expect(nextRound(MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    expect(db.writes()).toEqual([]);
  });

  it("resetLive: tylko dla uruchomionego/zakończonego, zapisy zawężone do mixera", async () => {
    state.mixerStatus = "draft";
    await expect(resetLive(MIXER, EVENT)).resolves.toMatchObject({ status: "error" });
    expect(db.writes()).toEqual([]);

    state.mixerStatus = "finished";
    await expect(resetLive(MIXER, EVENT)).resolves.toMatchObject({ status: "success" });
    const roundsUpd = db.writes().find((c) => c.table === "mixer_rounds");
    expect(roundsUpd?.filters).toEqual([["mixer_id", MIXER]]);
  });

  it("własny mixer: zmiana statusu uczestnika zawężona do mixera", async () => {
    state.mixerStatus = "generated";
    await expect(setParticipantStatus(PARTICIPANT, MIXER, EVENT, "absent")).resolves.toMatchObject({
      status: "success",
    });
    const upd = db.writes().find((c) => c.table === "mixer_participants");
    expect(upd?.filters).toEqual([["id", PARTICIPANT], ["mixer_id", MIXER]]);
  });

  it("własny mixer: edycja ice-breakera zawężona do mixera", async () => {
    await expect(updateIcebreaker(ICEBREAKER, MIXER, EVENT, "Pytanie?")).resolves.toMatchObject({
      status: "success",
    });
    const upd = db.writes().find((c) => c.table === "mixer_icebreakers");
    expect(upd?.filters).toEqual([["id", ICEBREAKER], ["mixer_id", MIXER]]);
  });
});
