import { beforeEach, describe, expect, it, vi } from "vitest";

// Linki obsługi (recepcja, posiłki) przestają działać dla wydarzenia usuniętego lub zawieszonego.
// Bez bazy: atrapa klienta zwracająca pierwszy wiersz pasujący do filtrów eq.

type Row = Record<string, unknown>;
const db = { tables: {} as Record<string, Row[]> };

function builder(table: string) {
  const filters: [string, unknown][] = [];
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    maybeSingle: async () => ({
      data: (db.tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
      error: null,
    }),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));

const { getEventByReceptionToken } = await import("@/lib/reception");
const { getMealByToken } = await import("@/lib/meals");

const event = {
  id: "event-a",
  organization_id: "org-a",
  slug: "next-stop-lodz",
  name: "Next Stop Łódź",
  reception_token: "rec-tok",
  deleted_at: null as string | null,
};

beforeEach(() => {
  db.tables = {
    events: [{ ...event }],
    event_meals: [{ id: "meal-1", event_id: "event-a", name: "Lunch", access_token: "meal-tok" }],
    event_suspensions: [],
    organization_suspensions: [],
  };
});

describe("link recepcji", () => {
  it("działa dla aktywnego wydarzenia i nie zwraca pól wewnętrznych", async () => {
    expect(await getEventByReceptionToken("rec-tok")).toEqual({
      id: "event-a",
      organization_id: "org-a",
      slug: "next-stop-lodz",
      name: "Next Stop Łódź",
    });
  });

  it("nie działa po usunięciu wydarzenia", async () => {
    db.tables.events[0].deleted_at = "2026-11-20T10:00:00.000Z";
    expect(await getEventByReceptionToken("rec-tok")).toBeNull();
  });

  it("nie działa po zawieszeniu wydarzenia", async () => {
    db.tables.event_suspensions.push({ event_id: "event-a" });
    expect(await getEventByReceptionToken("rec-tok")).toBeNull();
  });

  it("nie działa po zawieszeniu organizacji", async () => {
    db.tables.organization_suspensions.push({ organization_id: "org-a" });
    expect(await getEventByReceptionToken("rec-tok")).toBeNull();
  });

  it("zawieszenie innego wydarzenia nie blokuje linku", async () => {
    db.tables.event_suspensions.push({ event_id: "event-b" });
    db.tables.organization_suspensions.push({ organization_id: "org-b" });
    expect(await getEventByReceptionToken("rec-tok")).not.toBeNull();
  });
});

describe("link wydawania posiłku", () => {
  it("działa dla aktywnego wydarzenia", async () => {
    expect(await getMealByToken("meal-tok")).toEqual({
      meal: { id: "meal-1", event_id: "event-a", name: "Lunch", access_token: "meal-tok" },
      event: { id: "event-a", slug: "next-stop-lodz", name: "Next Stop Łódź" },
    });
  });

  it("nie działa po usunięciu wydarzenia", async () => {
    db.tables.events[0].deleted_at = "2026-11-20T10:00:00.000Z";
    expect(await getMealByToken("meal-tok")).toBeNull();
  });

  it("nie działa po zawieszeniu wydarzenia lub organizacji", async () => {
    db.tables.event_suspensions.push({ event_id: "event-a" });
    expect(await getMealByToken("meal-tok")).toBeNull();
    db.tables.event_suspensions = [];
    db.tables.organization_suspensions.push({ organization_id: "org-a" });
    expect(await getMealByToken("meal-tok")).toBeNull();
  });
});
