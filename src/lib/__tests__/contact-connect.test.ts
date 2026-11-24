import { beforeEach, describe, expect, it, vi } from "vitest";
import { planQrConnect, type PairContactRow } from "@/lib/contact-connect";

// Skan QR kontaktu, gdy para ma wiersze w obu kierunkach (prośby wysłane jednocześnie):
// skan ma nawiązać kontakt zamiast kończyć się błędem.

const NOW = "2026-11-24T10:00:00.000Z";
const row = (over: Partial<PairContactRow>): PairContactRow => ({
  id: "r",
  requester_id: "a",
  recipient_id: "b",
  status: "pending",
  created_at: "2026-11-20T10:00:00.000Z",
  requester_note: null,
  recipient_note: null,
  ...over,
});

describe("planQrConnect", () => {
  it("jeden wiersz pending → accepted, nic do usunięcia", () => {
    const plan = planQrConnect([row({ id: "r1" })], NOW);
    expect(plan).toEqual({ keepId: "r1", update: { status: "accepted", responded_at: NOW }, deleteIds: [] });
  });

  it("prośby w obu kierunkach: zostaje starszy wiersz, drugi usuwany, notatka przeniesiona", () => {
    const plan = planQrConnect(
      [
        row({ id: "ab", requester_id: "a", recipient_id: "b", requester_note: "notatka A", created_at: "2026-11-21T10:00:00.000Z" }),
        row({ id: "ba", requester_id: "b", recipient_id: "a", requester_note: "notatka B" }),
      ],
      NOW,
    );
    expect(plan.keepId).toBe("ba");
    expect(plan.deleteIds).toEqual(["ab"]);
    // W zachowanym wierszu (b→a) notatka A trafia do kolumny odbiorcy.
    expect(plan.update).toEqual({ status: "accepted", responded_at: NOW, recipient_note: "notatka A" });
  });

  it("wiersz już zaakceptowany jest zachowany bez zmiany daty, nie nadpisujemy istniejącej notatki", () => {
    const plan = planQrConnect(
      [
        row({ id: "ab", status: "accepted", requester_note: "moja A" }),
        row({ id: "ba", requester_id: "b", recipient_id: "a", requester_note: "B", recipient_note: "stara A", created_at: "2026-01-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(plan.keepId).toBe("ab");
    expect(plan.deleteIds).toEqual(["ba"]);
    expect(plan.update).toEqual({ status: "accepted", recipient_note: "B" });
  });

  it("odmowa i prośba zwrotna: skan łączy parę", () => {
    const plan = planQrConnect(
      [row({ id: "ab", status: "declined" }), row({ id: "ba", requester_id: "b", recipient_id: "a", created_at: "2026-11-22T10:00:00.000Z" })],
      NOW,
    );
    expect(plan.keepId).toBe("ab");
    expect(plan.update.status).toBe("accepted");
    expect(plan.deleteIds).toEqual(["ba"]);
  });

  it("wybór wiersza nie zależy od kolejności wierszy (równoczesne skany obu osób zachowują ten sam)", () => {
    const rows = [
      row({ id: "ab", status: "declined" }),
      row({ id: "ba", requester_id: "b", recipient_id: "a", status: "declined" }),
    ];
    const p1 = planQrConnect(rows, NOW);
    const p2 = planQrConnect([...rows].reverse(), NOW);
    // ta sama data utworzenia → rozstrzyga najniższe id
    expect(p1.keepId).toBe("ab");
    expect(p2.keepId).toBe("ab");
    expect(p1.deleteIds).toEqual(["ba"]);
    expect(p2.deleteIds).toEqual(["ba"]);
  });
});

// ── connectViaCode z atrapą bazy ─────────────────────────────────────────────

type Row = Record<string, unknown>;
const db = { contact_requests: [] as Row[] };
let scanner = { id: "a", event_id: "ev" };
let owner = { id: "b", event_id: "ev" };

function builder() {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "delete" = "select";
  let patch: Row = {};
  const run = () => {
    const hit = db.contact_requests.filter((r) => filters.every((f) => f(r)));
    if (op === "update") hit.forEach((r) => Object.assign(r, patch));
    if (op === "delete") db.contact_requests = db.contact_requests.filter((r) => !hit.includes(r));
    return { data: op === "select" ? hit.map((r) => ({ ...r })) : null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    update: (p: Row) => ((op = "update"), (patch = p), b),
    delete: () => ((op = "delete"), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    or: () => (
      filters.push(
        (r) =>
          (r.requester_id === "a" && r.recipient_id === "b") || (r.requester_id === "b" && r.recipient_id === "a"),
      ),
      b
    ),
    insert: async (r: Row) => {
      const dup = db.contact_requests.some(
        (x) => x.requester_id === r.requester_id && x.recipient_id === r.recipient_id,
      );
      if (dup) return { error: { code: "23505", message: "duplicate" } };
      db.contact_requests.push({ id: `new-${db.contact_requests.length}`, ...r });
      return { error: null };
    },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => builder() }) }));
vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => scanner }));
vi.mock("@/lib/contact-requests", () => ({ getAttendeeByContactCode: async () => owner }));
vi.mock("@/lib/gamification", () => ({ checkNetworkingQuestProgress: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "eventro.pl" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { connectViaCode } = await import("@/app/(participant)/e/[slug]/connect/[code]/actions");

beforeEach(() => {
  db.contact_requests = [];
  scanner = { id: "a", event_id: "ev" };
  owner = { id: "b", event_id: "ev" };
});

describe("connectViaCode", () => {
  it("prośby w obu kierunkach: skan nawiązuje kontakt i zostawia jeden wiersz", async () => {
    db.contact_requests = [
      { id: "ab", event_id: "ev", requester_id: "a", recipient_id: "b", status: "pending", created_at: "2026-11-20T10:00:00Z", requester_note: null, recipient_note: null },
      { id: "ba", event_id: "ev", requester_id: "b", recipient_id: "a", status: "pending", created_at: "2026-11-20T10:00:00Z", requester_note: null, recipient_note: null },
    ];
    await expect(connectViaCode("expo", "CODE")).rejects.toThrow(/REDIRECT:.*contacts/);
    expect(db.contact_requests).toHaveLength(1);
    expect(db.contact_requests[0]).toMatchObject({ id: "ab", status: "accepted" });
  });

  it("równoczesne skany obu osób: obie akcje zachowują ten sam wiersz, kontakt nie znika", async () => {
    const base = { event_id: "ev", created_at: "2026-11-20T10:00:00Z", requester_note: null, recipient_note: null };
    db.contact_requests = [
      { id: "ab", requester_id: "a", recipient_id: "b", status: "declined", ...base },
      { id: "ba", requester_id: "b", recipient_id: "a", status: "declined", ...base },
    ];
    // Obie akcje czytają, zanim którakolwiek zapisze: odczyt zwraca migawkę tych samych wierszy.
    const snapshot = db.contact_requests.map((r) => ({ ...r }));
    const plans = [
      planQrConnect(snapshot as never, "t1"),
      planQrConnect([...snapshot].reverse() as never, "t2"),
    ];
    for (const plan of plans) {
      db.contact_requests.filter((r) => r.id === plan.keepId).forEach((r) => Object.assign(r, plan.update));
      db.contact_requests = db.contact_requests.filter((r) => !plan.deleteIds.includes(r.id as string));
    }
    expect(db.contact_requests).toEqual([expect.objectContaining({ id: "ab", status: "accepted" })]);
  });

  it("skan wykonany przez drugą osobę zachowuje ten sam wiersz", async () => {
    scanner = { id: "b", event_id: "ev" };
    owner = { id: "a", event_id: "ev" };
    db.contact_requests = [
      { id: "ab", event_id: "ev", requester_id: "a", recipient_id: "b", status: "pending", created_at: "2026-11-20T10:00:00Z", requester_note: null, recipient_note: null },
      { id: "ba", event_id: "ev", requester_id: "b", recipient_id: "a", status: "pending", created_at: "2026-11-20T11:00:00Z", requester_note: null, recipient_note: null },
    ];
    await expect(connectViaCode("expo", "CODE")).rejects.toThrow(/REDIRECT:.*contacts/);
    expect(db.contact_requests).toEqual([expect.objectContaining({ id: "ab", status: "accepted" })]);
  });

  it("brak wierszy: nowy kontakt accepted", async () => {
    await expect(connectViaCode("expo", "CODE")).rejects.toThrow(/REDIRECT/);
    expect(db.contact_requests).toEqual([
      expect.objectContaining({ requester_id: "a", recipient_id: "b", status: "accepted" }),
    ]);
  });

  it("ponowny skan po nawiązaniu kontaktu nie zgłasza błędu", async () => {
    await expect(connectViaCode("expo", "CODE")).rejects.toThrow(/REDIRECT/);
    await expect(connectViaCode("expo", "CODE")).rejects.toThrow(/REDIRECT/);
    expect(db.contact_requests).toHaveLength(1);
  });
});
