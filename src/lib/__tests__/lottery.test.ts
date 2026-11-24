import { beforeEach, describe, expect, it, vi } from "vitest";

// Loteria: pełna lista uczestników mimo limitu 1000 wierszy na zapytanie oraz wykluczenia
// zapisane na serwerze (obowiązują po odświeżeniu strony i na innym urządzeniu).

type Row = Record<string, unknown>;
const MAX_ROWS = 1000; // jak db-max-rows w PostgREST
const db = {
  attendees: [] as Row[],
  lottery_exclusions: [] as Row[],
  event_analytics_log: [] as Row[],
};

function fakeClient() {
  return {
    from(name: string) {
      const table = name as keyof typeof db;
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "insert" | "upsert" | "delete" = "select";
      let payload: Row = {};
      let range: [number, number] | null = null;
      let orderKey: string | null = null;
      const run = () => {
        const match = (r: Row) => filters.every((f) => f(r));
        if (op === "insert" || op === "upsert") {
          const dup =
            op === "upsert" &&
            db[table].some((r) => r.event_id === payload.event_id && r.attendee_id === payload.attendee_id);
          if (!dup) db[table].push({ ...payload });
          return { data: null, error: null };
        }
        if (op === "delete") {
          db[table] = db[table].filter((r) => !match(r));
          return { data: null, error: null };
        }
        let rows = db[table].filter(match);
        if (orderKey) rows = [...rows].sort((a, b) => String(a[orderKey!]).localeCompare(String(b[orderKey!])));
        const [from, to] = range ?? [0, Infinity];
        rows = rows.slice(from, Math.min(to + 1, from + MAX_ROWS));
        return { data: rows, error: null };
      };
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
        gte: (k: string, v: number) => (filters.push((r) => (r[k] as number) >= v), b),
        order: (k: string) => ((orderKey = k), b),
        range: (f: number, t: number) => ((range = [f, t]), b),
        insert: (p: Row) => ((op = "insert"), (payload = p), b),
        upsert: (p: Row) => ((op = "upsert"), (payload = p), b),
        delete: () => ((op = "delete"), b),
        maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
        then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    },
  };
}

let ownEvent: Row | null = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient() }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => ownEvent }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { buildLotteryPool, pickWeightedWinner } = await import("@/lib/lottery");
const { fetchAllRows } = await import("@/lib/paginate");
const { drawLotteryWinner, excludeLotteryAttendee, restoreLotteryAttendee, resetLotteryExclusions } = await import(
  "@/app/(organizer)/admin/events/[eventId]/lottery/actions"
);

const person = (id: string, points: number, event_id = "ev1", status = "approved") => ({
  id,
  event_id,
  status,
  points,
  first_name: id,
  last_name: null,
  company: null,
});

beforeEach(() => {
  db.attendees = [];
  db.lottery_exclusions = [];
  db.event_analytics_log = [];
  ownEvent = { id: "ev1", organization_id: "org1", gamification_enabled: true, lottery_points_per_ticket: 10 };
});

describe("pula i ważone losowanie", () => {
  const c = (id: string, points: number) => ({ id, first_name: null, last_name: null, company: null, points });

  it("bilety = floor(punkty / próg), bez osób z 0 biletów i wykluczonych", () => {
    const pool = buildLotteryPool([c("a", 9), c("b", 10), c("c", 35), c("d", 50)], 10, new Set(["d"]));
    expect(pool.map((p) => [p.id, p.tickets])).toEqual([
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("losowanie proporcjonalne do biletów (granice przedziałów)", () => {
    const pool = buildLotteryPool([c("b", 10), c("c", 30)], 10, new Set());
    expect(pickWeightedWinner(pool, 0)?.winner.id).toBe("b");
    expect(pickWeightedWinner(pool, 0.24)?.winner.id).toBe("b");
    expect(pickWeightedWinner(pool, 0.25)?.winner.id).toBe("c");
    expect(pickWeightedWinner(pool, 0.999)?.winner.id).toBe("c");
    expect(pickWeightedWinner(pool, 0.5)?.totalTickets).toBe(4);
    expect(pickWeightedWinner([], 0.5)).toBeNull();
  });
});

describe("fetchAllRows — stronicowanie", () => {
  it("pobiera wszystkie wiersze ponad limit jednej strony", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const calls: [number, number][] = [];
    const { data, error } = await fetchAllRows<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("błąd strony → zwraca błąd", async () => {
    const r = await fetchAllRows(async () => ({ data: null, error: { message: "x" } }));
    expect(r.error).toEqual({ message: "x" });
  });
});

describe("drawLotteryWinner", () => {
  it("uczestnicy powyżej 1000. wiersza też biorą udział", async () => {
    for (let i = 0; i < 1500; i++) db.attendees.push(person(`p${String(i).padStart(4, "0")}`, 10));
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.9999); // ostatni bilet w puli
    try {
      const r = await drawLotteryWinner("ev1", []);
      expect(r).toMatchObject({ status: "ok", winner: { id: "p1499", tickets: 1 } });
    } finally {
      spy.mockRestore();
    }
    expect(db.event_analytics_log[0]).toMatchObject({ action_type: "lottery_winner", attendee_id: "p1499" });
    expect((db.event_analytics_log[0].metadata as { total_tickets: number }).total_tickets).toBe(1500);
  });

  it("wykluczenie zapisane na serwerze obowiązuje bez listy z przeglądarki", async () => {
    db.attendees.push(person("a", 100), person("b", 10));
    expect(await excludeLotteryAttendee("ev1", "a")).toEqual({ status: "ok" });
    for (let i = 0; i < 20; i++) {
      expect(await drawLotteryWinner("ev1", [])).toMatchObject({ status: "ok", winner: { id: "b" } });
    }
    expect(await excludeLotteryAttendee("ev1", "b")).toEqual({ status: "ok" });
    expect(await drawLotteryWinner("ev1", [])).toEqual({ status: "empty" });
  });

  it("przywrócenie i reset wykluczeń", async () => {
    db.attendees.push(person("a", 100));
    await excludeLotteryAttendee("ev1", "a");
    await excludeLotteryAttendee("ev1", "a"); // powtórka bez duplikatu
    expect(db.lottery_exclusions).toHaveLength(1);
    expect(await restoreLotteryAttendee("ev1", "a")).toEqual({ status: "ok" });
    expect(await drawLotteryWinner("ev1", [])).toMatchObject({ status: "ok", winner: { id: "a" } });
    await excludeLotteryAttendee("ev1", "a");
    expect(await resetLotteryExclusions("ev1")).toEqual({ status: "ok" });
    expect(db.lottery_exclusions).toHaveLength(0);
  });

  it("nie wyklucza uczestnika z innego eventu", async () => {
    db.attendees.push(person("x", 100, "ev2"));
    expect(await excludeLotteryAttendee("ev1", "x")).toEqual({ status: "error", message: "Uczestnik nie znaleziony." });
    expect(db.lottery_exclusions).toHaveLength(0);
  });

  it("bez uprawnień do eventu → błąd, bez zapisu", async () => {
    ownEvent = null;
    db.attendees.push(person("a", 100));
    expect(await excludeLotteryAttendee("ev1", "a")).toMatchObject({ status: "error" });
    expect(await resetLotteryExclusions("ev1")).toMatchObject({ status: "error" });
    expect(await drawLotteryWinner("ev1", [])).toMatchObject({ status: "error" });
    expect(db.lottery_exclusions).toHaveLength(0);
  });

  it("pomija niezatwierdzonych i uczestników innych eventów", async () => {
    db.attendees.push(person("pending", 100, "ev1", "pending"), person("other", 100, "ev2"), person("ok", 10));
    for (let i = 0; i < 10; i++) {
      expect(await drawLotteryWinner("ev1", [])).toMatchObject({ winner: { id: "ok" } });
    }
  });
});

describe("nakładające się strony (zapis między zapytaniami)", () => {
  const rows = Array.from({ length: 1500 }, (_, i) => person(`p${String(i).padStart(4, "0")}`, 10));

  // Strona 2 zaczyna się powtórzonym ostatnim wierszem strony 1 — tak jak przy offsetowym
  // stronicowaniu, gdy przed bieżącym offsetem do zbioru wejdzie nowy wiersz.
  function overlappingClient() {
    const b = {
      from: () => b,
      select: () => b,
      eq: () => b,
      gte: () => b,
      order: () => b,
      range: async (from: number, to: number) => ({
        data: from === 0 ? rows.slice(0, to + 1) : rows.slice(from - 1, to),
        error: null,
      }),
    };
    return b;
  }

  it("dedupeById zostawia pierwsze wystąpienie i kolejność", async () => {
    const { dedupeById } = await import("@/lib/paginate");
    expect(dedupeById([{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }, { id: "b" }])).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });

  it("uczestnik z granicy stron trafia do puli raz", async () => {
    const { loadLotteryCandidates } = await import("@/lib/lottery");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await loadLotteryCandidates(overlappingClient() as any, "ev1", 10);
    expect(error).toBeNull();
    expect(data.filter((a) => a.id === "p0999")).toHaveLength(1);
    expect(new Set(data.map((a) => a.id)).size).toBe(data.length);
    const pool = buildLotteryPool(data, 10, new Set());
    expect(pickWeightedWinner(pool, 0.5)?.totalTickets).toBe(data.length);
  });
});
