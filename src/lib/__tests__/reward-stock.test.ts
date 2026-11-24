import { beforeEach, describe, expect, it, vi } from "vitest";

// Magazyn nagród: odrzucone (zduplikowane) wydanie nie może zmieniać stanu magazynu,
// a zwrot sztuki liczy się od aktualnego stanu w bazie, nie od wartości odczytanej wcześniej.

type Row = Record<string, unknown>;
const db = {
  rewards: [] as Row[],
  reward_redemptions: [] as Row[],
  attendees: [] as Row[],
  /** Wymuszony błąd INSERT do reward_redemptions (np. wyścig dwóch kart). */
  failInsert: null as null | { code: string },
  /** Hook przed UPDATE rewards — symuluje równoległą zmianę stanu. */
  beforeUpdate: null as null | (() => void),
};

function fakeClient() {
  return {
    from(name: string) {
      const table = name as "rewards" | "reward_redemptions" | "attendees";
      const filters: [string, unknown][] = [];
      let op: "select" | "update" | "insert" = "select";
      let payload: Row = {};
      const rows = () => (db[table] as Row[]).filter((r) => filters.every(([k, v]) => r[k] === v));
      const run = () => {
        if (op === "insert") {
          if (table === "reward_redemptions" && db.failInsert) return { data: null, error: db.failInsert };
          const dup = (db[table] as Row[]).some(
            (r) => r.reward_id === payload.reward_id && r.attendee_id === payload.attendee_id,
          );
          if (dup) return { data: null, error: { code: "23505" } };
          (db[table] as Row[]).push({ redeemed_at: "2026-11-20T10:00:00Z", ...payload });
          return { data: null, error: null };
        }
        if (op === "update") {
          db.beforeUpdate?.();
          db.beforeUpdate = null;
          const hit = rows();
          hit.forEach((r) => Object.assign(r, payload));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        }
        return { data: rows(), error: null };
      };
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (filters.push([k, v]), b),
        gt: () => b,
        update: (p: Row) => ((op = "update"), (payload = p), b),
        insert: (p: Row) => ((op = "insert"), (payload = p), b),
        maybeSingle: async () => {
          const r = run();
          return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
        },
        then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient() }));
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => ({ id: "ev1", organization_id: "org1" }) }));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ allowed: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("sharp", () => ({ default: () => ({}) }));

const { changeRewardStock } = await import("@/lib/reward-stock");
const { redeemReward, issueRewardByToken } = await import(
  "@/app/(organizer)/admin/events/[eventId]/rewards/actions"
);

const stock = () => db.rewards[0].stock;

beforeEach(() => {
  db.rewards = [{ id: "r1", event_id: "ev1", name: "Kubek", stock: 5, points_required: 0 }];
  db.reward_redemptions = [];
  db.attendees = [
    { id: "a1", event_id: "ev1", check_in_token: "tok-a1", first_name: "Ala", last_name: "K", points: 100, status: "approved" },
  ];
  db.failInsert = null;
  db.beforeUpdate = null;
});

describe("changeRewardStock", () => {
  it("dekrementacja i zwrot liczone od aktualnego stanu", async () => {
    expect(await changeRewardStock(fakeClient(), "r1", "ev1", -1)).toEqual({ ok: true, stock: 4 });
    expect(await changeRewardStock(fakeClient(), "r1", "ev1", 1)).toEqual({ ok: true, stock: 5 });
    expect(stock()).toBe(5);
  });

  it("stan 0 → odmowa wydania, bez zmiany", async () => {
    db.rewards[0].stock = 0;
    expect(await changeRewardStock(fakeClient(), "r1", "ev1", -1)).toEqual({ ok: false, reason: "out_of_stock" });
    expect(stock()).toBe(0);
  });

  it("magazyn nielimitowany (NULL) → bez zmian", async () => {
    db.rewards[0].stock = null;
    expect(await changeRewardStock(fakeClient(), "r1", "ev1", -1)).toEqual({ ok: true, stock: null });
    expect(stock()).toBeNull();
  });

  it("równoległa zmiana stanu między odczytem a zapisem → ponowienie, bez nadpisania", async () => {
    db.beforeUpdate = () => {
      db.rewards[0].stock = 3; // ktoś inny wydał w międzyczasie 2 sztuki
    };
    expect(await changeRewardStock(fakeClient(), "r1", "ev1", -1)).toEqual({ ok: true, stock: 2 });
    expect(stock()).toBe(2);
  });

  it("nieznana nagroda → not_found", async () => {
    expect(await changeRewardStock(fakeClient(), "nope", "ev1", 1)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("redeemReward — ponowne wydanie tej samej nagrody", () => {
  it("pierwsze wydanie zmniejsza magazyn o 1, drugie jest odrzucone i nie zmienia magazynu", async () => {
    expect(await redeemReward("ev1", "r1", "a1")).toMatchObject({ status: "success" });
    expect(stock()).toBe(4);
    expect(await redeemReward("ev1", "r1", "a1")).toEqual({
      status: "error",
      message: "Uczestnik już odebrał tę nagrodę.",
    });
    expect(stock()).toBe(4);
    expect(db.reward_redemptions).toHaveLength(1);
  });

  it("wyścig (INSERT odrzucony jako duplikat po dekrementacji) → stan wraca dokładnie do wyjściowego", async () => {
    db.failInsert = { code: "23505" };
    expect(await redeemReward("ev1", "r1", "a1")).toMatchObject({ status: "error" });
    expect(stock()).toBe(5);
  });

  it("inny błąd INSERT → stan wraca do wyjściowego", async () => {
    db.failInsert = { code: "XX000" };
    expect(await redeemReward("ev1", "r1", "a1")).toEqual({ status: "error", message: "Nie udało się wydać nagrody." });
    expect(stock()).toBe(5);
  });
});

describe("issueRewardByToken — ponowny skan tej samej osoby", () => {
  it("wielokrotny skan po odbiorze nie dopisuje fantomowych sztuk", async () => {
    expect(await issueRewardByToken("ev1", "r1", "tok-a1")).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(stock()).toBe(4);
    for (let i = 0; i < 3; i++) {
      expect(await issueRewardByToken("ev1", "r1", "tok-a1")).toMatchObject({
        ok: true,
        alreadyCheckedIn: true,
        checkedInAt: "2026-11-20T10:00:00Z",
      });
    }
    expect(stock()).toBe(4);
    expect(db.reward_redemptions).toHaveLength(1);
  });

  it("wyścig przy INSERT → zwrot sztuki do stanu wyjściowego", async () => {
    db.failInsert = { code: "23505" };
    expect(await issueRewardByToken("ev1", "r1", "tok-a1")).toMatchObject({ ok: true, alreadyCheckedIn: true });
    expect(stock()).toBe(5);
  });
});

describe("redeemReward — uczestnik musi należeć do eventu i spełniać warunki", () => {
  it("uczestnik z innego eventu → odmowa, magazyn i wydania bez zmian", async () => {
    db.attendees.push({ id: "b1", event_id: "ev2", first_name: "Obcy", points: 999, status: "approved" });
    expect(await redeemReward("ev1", "r1", "b1")).toEqual({ status: "error", message: "Uczestnik nie znaleziony." });
    expect(stock()).toBe(5);
    expect(db.reward_redemptions).toHaveLength(0);
  });

  it("uczestnik niezatwierdzony → odmowa", async () => {
    db.attendees.push({ id: "a2", event_id: "ev1", points: 100, status: "pending" });
    expect(await redeemReward("ev1", "r1", "a2")).toMatchObject({ status: "error" });
    expect(stock()).toBe(5);
    expect(db.reward_redemptions).toHaveLength(0);
  });

  it("za mało punktów → odmowa (jak przy wydaniu po QR)", async () => {
    db.rewards[0].points_required = 150;
    expect(await redeemReward("ev1", "r1", "a1")).toEqual({
      status: "error",
      message: "Uczestnik nie ma wystarczającej liczby punktów.",
    });
    expect(stock()).toBe(5);
  });

  it("dokładnie wymagana liczba punktów → wydanie", async () => {
    db.rewards[0].points_required = 100;
    expect(await redeemReward("ev1", "r1", "a1")).toMatchObject({ status: "success" });
    expect(stock()).toBe(4);
  });
});
