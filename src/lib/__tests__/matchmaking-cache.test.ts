import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";
import type { Attendee } from "@/lib/attendees";

const db = createDbMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));

const { getCachedMatches, joinCachedMatches } = await import("@/lib/matchmaking");

const EVENT = "event-1";
const SELF = "self";

function person(id: string, over: Partial<Attendee> = {}): Attendee {
  return {
    id,
    event_id: EVENT,
    first_name: id,
    last_name: null,
    status: "approved",
    networking_visible: true,
    ...over,
  } as Attendee;
}

const row = (id: string, score: number) => ({
  suggested_attendee_id: id,
  score,
  reason: `r-${id}`,
  first_question: null,
});

describe("joinCachedMatches — filtr cache wg aktualnego stanu", () => {
  it("pomija osoby z ukrytym profilem, odrzucone, oczekujące, usunięte i z innego eventu", () => {
    const rows = [row("ok", 50), row("hidden", 40), row("rejected", 30), row("pending", 25), row("gone", 20), row("other", 10)];
    const profiles = [
      person("ok"),
      person("hidden", { networking_visible: false }),
      person("rejected", { status: "rejected" }),
      person("pending", { status: "pending" }),
      person("other", { event_id: "event-2" }),
    ];
    const out = joinCachedMatches(rows, profiles, EVENT, SELF);
    expect(out.map((m) => m.attendee.id)).toEqual(["ok"]);
    expect(out[0]).toMatchObject({ score: 50, reason: "r-ok" });
  });

  it("nie zwraca samego pytającego i zachowuje kolejność wierszy cache", () => {
    const out = joinCachedMatches(
      [row("b", 30), row(SELF, 20), row("a", 10)],
      [person("a"), person("b"), person(SELF)],
      EVENT,
      SELF,
    );
    expect(out.map((m) => m.attendee.id)).toEqual(["b", "a"]);
  });
});

describe("getCachedMatches", () => {
  beforeEach(() => db.reset());

  it("profile pobierane z filtrem eventu, statusu approved i widoczności", async () => {
    db.results["match_suggestions:select"] = () => ({ data: [row("ok", 50), row("hidden", 40)], error: null });
    db.results["attendees:select"] = () => ({
      data: [person("ok"), person("hidden", { networking_visible: false })],
      error: null,
    });
    const out = await getCachedMatches(EVENT, SELF);
    expect(out.map((m) => m.attendee.id)).toEqual(["ok"]);
    const q = db.calls.find((c) => c.table === "attendees");
    expect(q?.filters).toEqual(
      expect.arrayContaining([
        ["event_id", EVENT],
        ["status", "approved"],
        ["networking_visible", true],
      ]),
    );
  });

  it("pusty cache → brak zapytania o profile", async () => {
    db.results["match_suggestions:select"] = () => ({ data: [], error: null });
    await expect(getCachedMatches(EVENT, SELF)).resolves.toEqual([]);
    expect(db.calls.some((c) => c.table === "attendees")).toBe(false);
  });
});
