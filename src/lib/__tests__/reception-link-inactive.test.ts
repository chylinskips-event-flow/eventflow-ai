import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLinkInactive, RECEPTION_LINK_INACTIVE_TITLE } from "@/lib/reception-feedback";

// Link recepcji wyłączony w trakcie zmiany: akcje obsługi zwracają „link_inactive”
// (zamiast rzucać wyjątek, który wywracał stronę), a panel rozpoznaje ten wynik.

const state = { event: null as null | { id: string; organization_id: string; slug: string; name: string } };
const calls: string[] = [];

vi.mock("@/lib/reception", () => ({
  getEventByReceptionToken: async () => state.event,
  checkInByQr: async () => (calls.push("qr"), { ok: true, name: "Ania", alreadyCheckedIn: false }),
  checkInById: async () => (calls.push("id"), { ok: true, name: "Ania", alreadyCheckedIn: false }),
  undoCheckIn: async () => void calls.push("undo"),
  getBadgeLabel: async () => ({ ok: true }),
}));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { staffCheckInByQr, staffCheckInById, staffUndoCheckIn } = await import(
  "@/app/(participant)/e/[slug]/recepcja/[token]/actions"
);

beforeEach(() => {
  state.event = { id: "ev", organization_id: "org", slug: "expo", name: "Expo" };
  calls.length = 0;
});

describe("akcje linku recepcji po wyłączeniu linku", () => {
  it("skan, meldowanie i cofnięcie zwracają link_inactive bez wyjątku i bez zapisu", async () => {
    state.event = null;
    const results = [
      await staffCheckInByQr("tok", "ci"),
      await staffCheckInById("tok", "a1"),
      await staffUndoCheckIn("tok", "a1"),
    ];
    for (const r of results) {
      expect(r).toEqual({ ok: false, error: "link_inactive" });
      expect(isLinkInactive(r)).toBe(true);
    }
    expect(calls).toEqual([]);
  });

  it("aktywny link działa jak dotąd", async () => {
    expect(await staffCheckInByQr("tok", "ci")).toMatchObject({ ok: true });
    expect(await staffCheckInById("tok", "a1")).toMatchObject({ ok: true });
    expect(await staffUndoCheckIn("tok", "a1")).toEqual({ ok: true });
    expect(calls).toEqual(["qr", "id", "undo"]);
  });
});

describe("isLinkInactive", () => {
  it("rozpoznaje tylko wynik link_inactive", () => {
    expect(isLinkInactive({ ok: false, error: "link_inactive" })).toBe(true);
    expect(isLinkInactive({ ok: false, error: "not_found" })).toBe(false);
    expect(isLinkInactive({ ok: true })).toBe(false);
    expect(isLinkInactive(undefined)).toBe(false);
    expect(isLinkInactive(null)).toBe(false);
  });

  it("komunikat jest po polsku", () => {
    expect(RECEPTION_LINK_INACTIVE_TITLE).toBe("Link nieaktywny");
  });
});
