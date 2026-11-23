import { beforeEach, describe, expect, it, vi } from "vitest";

// Follow-up po wydarzeniu: kwalifikacja po ends_at (18–42 h), bez usuniętych/zawieszonych,
// jednokrotność przez followup_sent_at. Bez bazy: atrapa klienta z filtrami jak w PostgREST.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
const db = { tables: {} as Record<string, Row[]> };

function builder(table: string) {
  const filters: Filter[] = [];
  let update: Row | null = null;
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (update) {
      const hit = rows();
      hit.forEach((r) => Object.assign(r, update));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    return { data: rows(), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    update: (p: Row) => ((update = p), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), b),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (done: (v: unknown) => unknown) => Promise.resolve(run()).then(done),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock("@/lib/contact-requests", () => ({
  getEventFollowupRecipients: async (eventId: string) => [
    { email: `a@${eventId}.pl`, first_name: "Ala", contacts: [{ name: "Jan" }] },
    { email: `b@${eventId}.pl`, first_name: "Ola", contacts: [] },
  ],
}));
const sent: { to: string; eventName: string }[] = [];
const mail = { fail: false };
vi.mock("@/lib/email/post-event-followup", () => ({
  sendPostEventFollowupEmail: async (p: { to: string; eventName: string }) => {
    if (mail.fail) throw new Error("resend");
    sent.push(p);
  },
}));

const { runPostEventFollowup } = await import("@/lib/post-event-followup");

const NOW = Date.parse("2026-11-20T08:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const ev = (id: string, over: Row = {}): Row => ({
  id,
  name: `Event ${id}`,
  organization_id: "org-a",
  status: "live",
  deleted_at: null,
  followup_sent_at: null,
  ends_at: hoursAgo(24),
  ...over,
});

beforeEach(() => {
  sent.length = 0;
  mail.fail = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.tables = { events: [], event_suspensions: [], organization_suspensions: [] };
});

describe("kwalifikacja", () => {
  it("event po terminie wysyła follow-up bez ręcznego zakończenia (status live/published/completed)", async () => {
    db.tables.events = [ev("live"), ev("pub", { status: "published" }), ev("done", { status: "completed" })];
    expect(await runPostEventFollowup(NOW)).toEqual({ events: 3, emails: 3, failed: 0 });
    expect(sent.map((s) => s.to).sort()).toEqual(["a@done.pl", "a@live.pl", "a@pub.pl"]);
  });

  it("okno 18–42 h od ends_at: za wcześnie i za późno nic nie wychodzi", async () => {
    db.tables.events = [
      ev("fresh", { ends_at: hoursAgo(17) }),
      ev("old", { ends_at: hoursAgo(43) }),
      ev("edge-min", { ends_at: hoursAgo(18) }),
      ev("edge-max", { ends_at: hoursAgo(42) }),
    ];
    await runPostEventFollowup(NOW);
    expect(sent.map((s) => s.to).sort()).toEqual(["a@edge-max.pl", "a@edge-min.pl"]);
    expect(db.tables.events.find((e) => e.id === "fresh")?.followup_sent_at).toBeNull();
  });

  it("szkic, archiwum i usunięty event są pomijane", async () => {
    db.tables.events = [
      ev("draft", { status: "draft" }),
      ev("arch", { status: "archived" }),
      ev("del", { deleted_at: hoursAgo(1) }),
    ];
    expect(await runPostEventFollowup(NOW)).toEqual({ events: 0, emails: 0, failed: 0 });
  });

  it("zawieszony event lub organizacja: bez wysyłki i bez stempla", async () => {
    db.tables.events = [ev("sus"), ev("org", { organization_id: "org-b" })];
    db.tables.event_suspensions = [{ event_id: "sus" }];
    db.tables.organization_suspensions = [{ organization_id: "org-b" }];
    expect(await runPostEventFollowup(NOW)).toEqual({ events: 0, emails: 0, failed: 0 });
    expect(db.tables.events.every((e) => e.followup_sent_at === null)).toBe(true);
  });

  it("nie zmienia statusu wydarzenia", async () => {
    db.tables.events = [ev("live")];
    await runPostEventFollowup(NOW);
    expect(db.tables.events[0].status).toBe("live");
  });
});

describe("jednokrotność", () => {
  it("drugie uruchomienie nic nie wysyła", async () => {
    db.tables.events = [ev("x")];
    await runPostEventFollowup(NOW);
    expect(db.tables.events[0].followup_sent_at).toBe(new Date(NOW).toISOString());
    expect(await runPostEventFollowup(NOW + 3600_000)).toEqual({ events: 0, emails: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("dwa równoległe uruchomienia wysyłają raz", async () => {
    db.tables.events = [ev("x")];
    await Promise.all([runPostEventFollowup(NOW), runPostEventFollowup(NOW)]);
    expect(sent).toHaveLength(1);
  });

  it("event już oznaczony jako wysłany jest pomijany", async () => {
    db.tables.events = [ev("x", { followup_sent_at: hoursAgo(5) })];
    expect(await runPostEventFollowup(NOW)).toEqual({ events: 0, emails: 0, failed: 0 });
  });

  it("błąd maila liczy się jako failed, event zostaje oznaczony (bez duplikatów w retry)", async () => {
    mail.fail = true;
    db.tables.events = [ev("x")];
    expect(await runPostEventFollowup(NOW)).toEqual({ events: 1, emails: 0, failed: 1 });
    expect(db.tables.events[0].followup_sent_at).not.toBeNull();
  });
});
