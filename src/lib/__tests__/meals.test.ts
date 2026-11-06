import { beforeEach, describe, expect, it, vi } from "vitest";

// Wydawanie posiłków: bilet tego wydarzenia, jedno wydanie na posiłek, dostęp, rozliczenie.
// Bez bazy: atrapa klienta z tym samym ograniczeniem unikalności co indeks w migracji.

type Row = Record<string, unknown>;

const db = {
  tables: {} as Record<string, Row[]>,
  failInsert: false,
};

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let action: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  let head = false;
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));

  const run = () => {
    if (action === "insert") {
      if (db.failInsert) return { data: null, error: { code: "XX000" } };
      const list = (db.tables[table] ??= []);
      const dup = table === "meal_redemptions"
        && list.some((r) => r.meal_id === payload.meal_id && r.attendee_id === payload.attendee_id);
      if (dup) return { data: null, error: { code: "23505" } };
      list.push({ redeemed_at: "2026-11-12T11:30:00.000Z", ...payload });
      return { data: null, error: null };
    }
    if (action === "update") {
      rows().forEach((r) => Object.assign(r, payload));
      return { data: null, error: null };
    }
    if (action === "delete") {
      const gone = new Set(rows());
      db.tables[table] = (db.tables[table] ?? []).filter((r) => !gone.has(r));
      return { data: null, error: null };
    }
    return head ? { count: rows().length, error: null } : { data: rows(), error: null };
  };

  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), b),
    insert: (p: Row) => ((action = "insert"), (payload = p), b),
    update: (p: Row) => ((action = "update"), (payload = p), b),
    delete: () => ((action = "delete"), b),
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    order: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (done: (v: unknown) => unknown) => Promise.resolve(run()).then(done),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
const own = { event: null as null | Row };
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const meals = await import("@/lib/meals");
const organizer = await import("@/app/(organizer)/admin/events/[eventId]/meals/actions");
const staff = await import("@/app/(participant)/e/[slug]/posilek/[token]/actions");

const lunch = { id: "meal-1", event_id: "event-a", name: "Lunch", access_token: "tok" };
const dinner = { id: "meal-2", event_id: "event-a", name: "Kolacja", access_token: "tok-2" };
const person = (id: string, over: Row = {}) => ({
  id,
  event_id: "event-a",
  first_name: "Żaneta",
  last_name: "Nowak",
  company: "Firma",
  status: "approved",
  check_in_token: `qr-${id}`,
  ...over,
});

beforeEach(() => {
  own.event = { id: "event-a", slug: "next-stop-lodz" };
  db.failInsert = false;
  db.tables = {
    events: [{ id: "event-a", slug: "next-stop-lodz", name: "Next Stop Łódź" }],
    event_meals: [{ ...lunch }, { ...dinner }],
    meal_redemptions: [],
    attendees: [
      person("a1"),
      person("pending", { status: "pending" }),
      person("other", { event_id: "event-b" }),
    ],
  };
});

describe("wydanie po bilecie", () => {
  it("pierwszy skan wydaje posiłek", async () => {
    expect(await staff.staffRedeemByQr("tok", "qr-a1")).toEqual({
      ok: true,
      name: "Żaneta Nowak",
      alreadyCheckedIn: false,
    });
    expect(db.tables.meal_redemptions).toHaveLength(1);
    expect(db.tables.meal_redemptions[0]).toMatchObject({ redeemed_by: "staff", attendee_id: "a1" });
  });

  it("drugi skan tego samego biletu: bez drugiego wydania, z godziną pierwszego", async () => {
    await staff.staffRedeemByQr("tok", "qr-a1");
    expect(await staff.staffRedeemByQr("tok", "qr-a1")).toEqual({
      ok: true,
      name: "Żaneta Nowak",
      alreadyCheckedIn: true,
      checkedInAt: "2026-11-12T11:30:00.000Z",
    });
    expect(db.tables.meal_redemptions).toHaveLength(1);
  });

  it("ten sam bilet działa osobno na kolejny posiłek", async () => {
    await staff.staffRedeemByQr("tok", "qr-a1");
    expect(await staff.staffRedeemByQr("tok-2", "qr-a1")).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(db.tables.meal_redemptions).toHaveLength(2);
  });

  it("bilet z innego wydarzenia, nieznany kod i uczestnik niezatwierdzony nie dostają posiłku", async () => {
    expect(await staff.staffRedeemByQr("tok", "qr-other")).toEqual({ ok: false, error: "not_found" });
    expect(await staff.staffRedeemByQr("tok", "zly-kod")).toEqual({ ok: false, error: "not_found" });
    expect(await staff.staffRedeemByQr("tok", "qr-pending")).toEqual({ ok: false, error: "not_approved" });
    expect(db.tables.meal_redemptions).toHaveLength(0);
  });

  it("błąd zapisu nie wygląda jak wydanie", async () => {
    db.failInsert = true;
    await expect(staff.staffRedeemByQr("tok", "qr-a1")).rejects.toThrow();
  });

  it("cofnięcie pozwala wydać ponownie, tylko na tym posiłku", async () => {
    await staff.staffRedeemByQr("tok", "qr-a1");
    await staff.staffRedeemByQr("tok-2", "qr-a1");
    await staff.staffUndoRedemption("tok", "a1");
    expect(db.tables.meal_redemptions.map((r) => r.meal_id)).toEqual(["meal-2"]);
    expect(await staff.staffRedeemById("tok", "a1")).toMatchObject({ ok: true, alreadyCheckedIn: false });
  });
});

describe("dostęp", () => {
  it("wyłączony albo nieznany link obsługi nic nie zapisuje", async () => {
    await expect(staff.staffRedeemByQr("zly", "qr-a1")).rejects.toThrow();
    expect(db.tables.meal_redemptions).toHaveLength(0);
  });

  it("nowy link unieważnia stary", async () => {
    await organizer.renewMealLink("event-a", "meal-1");
    await expect(staff.staffRedeemByQr("tok", "qr-a1")).rejects.toThrow();
    await organizer.disableMealLink("event-a", "meal-1");
    expect(db.tables.event_meals[0].access_token).toBeNull();
  });

  it("nie właściciel wydarzenia nie wydaje i nie zarządza", async () => {
    own.event = null;
    await expect(organizer.organizerRedeemByQr("event-a", "meal-1", "qr-a1")).rejects.toThrow();
    await expect(organizer.renewMealLink("event-a", "meal-1")).rejects.toThrow();
    expect(await organizer.addMeal("event-a", "Lunch 2")).toMatchObject({ ok: false });
    expect(db.tables.meal_redemptions).toHaveLength(0);
    expect(db.tables.event_meals).toHaveLength(2);
  });

  it("posiłek innego wydarzenia nie przechodzi przez organizatora tego wydarzenia", async () => {
    db.tables.event_meals.push({ id: "meal-b", event_id: "event-b", name: "Obcy", access_token: null });
    await expect(organizer.organizerRedeemById("event-a", "meal-b", "a1")).rejects.toThrow();
  });
});

describe("zarządzanie i rozliczenie", () => {
  it("nazwa posiłku jest wymagana i ma limit", async () => {
    expect(await organizer.addMeal("event-a", "   ")).toMatchObject({ ok: false });
    expect(await organizer.addMeal("event-a", "x".repeat(81))).toMatchObject({ ok: false });
    expect(await organizer.addMeal("event-a", " Lunch 13.11 ")).toEqual({ ok: true });
    expect(db.tables.event_meals.at(-1)).toMatchObject({ name: "Lunch 13.11" });
  });

  it("posiłku z wydaniami nie da się usunąć, pustego tak", async () => {
    await staff.staffRedeemByQr("tok", "qr-a1");
    expect(await organizer.removeMeal("event-a", "meal-1")).toMatchObject({ ok: false });
    expect(await organizer.removeMeal("event-a", "meal-2")).toEqual({ ok: true });
    expect(db.tables.event_meals.map((m) => m.id)).toEqual(["meal-1"]);
  });

  it("lista obsługi pokazuje tylko zatwierdzonych z godziną wydania", async () => {
    await staff.staffRedeemByQr("tok", "qr-a1");
    expect(await meals.getMealAttendees(lunch)).toEqual([
      expect.objectContaining({ id: "a1", redeemed_at: "2026-11-12T11:30:00.000Z" }),
    ]);
  });

  it("CSV: liczy też osobę usuniętą z systemu, bez jej danych, w strefie wydarzenia", async () => {
    db.tables.meal_redemptions = [
      {
        meal_id: "meal-1",
        redeemed_at: "2026-11-12T11:30:00.000Z",
        attendee: { first_name: "Jan", last_name: "Nowak", company: "=Firma" },
      },
      { meal_id: "meal-1", redeemed_at: "2026-11-12T11:31:00.000Z", attendee: null },
    ];
    const lines = (await meals.getMealReportCsv(lunch, "Europe/Warsaw")).replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe("Lp.;Imię i nazwisko;Firma;Godzina wydania");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Jan Nowak;'=Firma;");
    expect(lines[1]).toContain("12:30");
    expect(lines[2]).toContain("2;Dane usunięte;;");
  });
});
