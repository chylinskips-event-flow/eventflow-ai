import { beforeEach, describe, expect, it, vi } from "vitest";
import { avatarPathsFor, ownedAvatarPath } from "@/lib/avatar-storage";

const EVENT = "11111111-1111-4111-8111-111111111111";
const ATT = "22222222-2222-4222-8222-222222222222";
const OTHER_EVENT = "33333333-3333-4333-8333-333333333333";
const OTHER_ATT = "44444444-4444-4444-8444-444444444444";
const base = "https://proj.supabase.co/storage/v1/object/public/attendee-avatars";

describe("ownedAvatarPath", () => {
  it("zwraca ścieżkę pliku tego uczestnika (bez ?v=)", () => {
    expect(ownedAvatarPath(`${base}/${EVENT}/${ATT}.webp?v=123`, EVENT, ATT)).toBe(`${EVENT}/${ATT}.webp`);
    expect(ownedAvatarPath(`${base}/${EVENT}/${ATT}.jpg`, EVENT, ATT)).toBe(`${EVENT}/${ATT}.jpg`);
  });

  it("ścieżka innego wydarzenia lub uczestnika → null", () => {
    expect(ownedAvatarPath(`${base}/${OTHER_EVENT}/${OTHER_ATT}.jpg`, EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath(`${base}/${EVENT}/${OTHER_ATT}.jpg`, EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath(`${base}/${OTHER_EVENT}/${ATT}.jpg`, EVENT, ATT)).toBeNull();
  });

  it("próby wyjścia poza folder, inne rozszerzenia i śmieci → null", () => {
    expect(ownedAvatarPath(`${base}/${EVENT}/${ATT}.jpg/../../${OTHER_EVENT}/${OTHER_ATT}.jpg`, EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath(`${base}/${EVENT}/${ATT}.html`, EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath(`${base}/${EVENT}/`, EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath("https://example.com/a.jpg", EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath(null, EVENT, ATT)).toBeNull();
    expect(ownedAvatarPath(`${base}/${EVENT}/${ATT}.jpg`, "", ATT)).toBeNull();
  });

  it("avatarPathsFor: tylko folder i id uczestnika", () => {
    expect(avatarPathsFor(EVENT, ATT)).toEqual([`${EVENT}/${ATT}.jpg`, `${EVENT}/${ATT}.png`, `${EVENT}/${ATT}.webp`]);
  });
});

// ── deleteAttendeeCompletely: usuwa wyłącznie pliki spod ścieżki uczestnika ──

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  removed: [] as string[][],
  selected: "" as string,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: (cols: string) => {
          state.selected = cols;
          return chain;
        },
        delete: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: state.row, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));

describe("deleteAttendeeCompletely", () => {
  beforeEach(() => {
    state.removed = [];
    state.row = null;
  });

  it("avatar_url wskazujący cudzy plik nie wpływa na to, co jest kasowane", async () => {
    state.row = { event_id: EVENT, avatar_url: `${base}/${OTHER_EVENT}/${OTHER_ATT}.jpg` };
    const { deleteAttendeeCompletely } = await import("@/lib/attendee-deletion");
    expect(await deleteAttendeeCompletely(ATT)).toEqual({ error: null });
    expect(state.selected).not.toContain("avatar_url");
    const all = state.removed.flat();
    expect(all).toEqual(avatarPathsFor(EVENT, ATT));
    expect(all.every((p) => p.startsWith(`${EVENT}/${ATT}.`))).toBe(true);
  });

  it("brak uczestnika → nic nie kasujemy w Storage", async () => {
    const { deleteAttendeeCompletely } = await import("@/lib/attendee-deletion");
    await deleteAttendeeCompletely(ATT);
    expect(state.removed).toEqual([]);
  });
});
