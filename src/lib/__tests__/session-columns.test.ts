import { beforeEach, describe, expect, it, vi } from "vitest";

// Sesje trafiają do komponentów klienckich (agenda uczestnika, panel moderatora) — zapytanie
// nie może pobierać tokenu rzutnika Q&A (sessions.qa_present_token) ani „*”.

const selects: string[] = [];
const row = {
  id: "s1",
  event_id: "ev1",
  title: "Otwarcie",
  description: null,
  track: null,
  room: "A",
  starts_at: null,
  ends_at: null,
  created_at: "x",
  updated_at: "x",
  session_speakers: [],
};
function client() {
  const b: Record<string, unknown> = {
    select: (s: string) => (selects.push(s), b),
    eq: () => b,
    order: async () => ({ data: [row], error: null }),
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => b };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

const { SESSION_COLUMNS, getEventSessions, getEventSessionsForParticipant, getEventSessionById } = await import(
  "@/lib/sessions"
);

beforeEach(() => {
  selects.length = 0;
});

describe("zapytania o sesje", () => {
  it("jawna lista kolumn bez tokenu rzutnika", () => {
    expect(SESSION_COLUMNS).not.toMatch(/token|\*/);
  });

  it("każdy getter pobiera tylko jawne kolumny sesji", async () => {
    await getEventSessions("ev1");
    await getEventSessionsForParticipant("ev1");
    await getEventSessionById("ev1", "s1");
    expect(selects).toHaveLength(3);
    for (const s of selects) {
      expect(s.startsWith(`${SESSION_COLUMNS},`)).toBe(true);
      expect(s).not.toContain("qa_present_token");
      expect(s.replace("speakers(*)", "")).not.toContain("*");
    }
  });
});
