import { beforeEach, describe, expect, it, vi } from "vitest";
import { B1_LABEL_SIZE, fitText, printerErrorMessage } from "@/lib/badge-label-core";

// Etykieta z recepcji: dopasowanie tekstu, komunikaty drukarki, dostęp (bez bazy: atrapa klienta).

type Query = { table: string; filters: unknown[][] };

const db = { rows: {} as Record<string, (q: Query) => unknown>, queries: [] as Query[] };

function builder(table: string) {
  const q: Query = { table, filters: [] };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (...args: unknown[]) => (q.filters.push(args), b),
    maybeSingle: async () => {
      db.queries.push(q);
      return { data: db.rows[table]?.(q) ?? null, error: null };
    },
  };
  return b;
}

const eqv = (q: Query, col: string) => q.filters.find((f) => f[0] === col)?.[1];

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
const feature = { on: true };
vi.mock("@/lib/entitlements", () => ({
  featureGate: async () => (feature.on ? { ok: true } : { ok: false, message: "Funkcja niedostępna w planie." }),
}));
const own = { event: null as null | Record<string, unknown> };
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const organizer = await import("@/app/(organizer)/admin/events/[eventId]/reception/actions");
const staff = await import("@/app/(participant)/e/[slug]/recepcja/[token]/actions");

const event = { id: "event-a", organization_id: "org", slug: "next-stop-lodz", name: "Next Stop Łódź" };
const attendee = {
  id: "att-1",
  event_id: "event-a",
  first_name: "Żaneta",
  last_name: "Grzęślewicz",
  company: "Firma",
  contact_code: "ABC123",
  status: "approved",
};

beforeEach(() => {
  feature.on = true;
  own.event = event;
  db.queries = [];
  db.rows = {
    events: (q) => (eqv(q, "reception_token") === "tok" ? event : null),
    attendees: (q) => (eqv(q, "id") === attendee.id && eqv(q, "event_id") === attendee.event_id ? attendee : null),
  };
});

describe("fitText", () => {
  // Każdy znak ma szerokość równą połowie rozmiaru czcionki.
  const measure = (text: string, size: number) => text.length * size * 0.5;
  const opts = { maxWidth: 100, maxLines: 2, sizes: [20, 10] };

  it("krótki tekst: największy rozmiar, jeden wiersz", () => {
    expect(fitText("Jan Nowak", opts, measure)).toEqual({ size: 20, lines: ["Jan Nowak"] });
  });

  it("zawija po słowach do limitu wierszy", () => {
    expect(fitText("Aleksandra Nowak", opts, measure)).toEqual({ size: 20, lines: ["Aleksandra", "Nowak"] });
  });

  it("gdy się nie mieści, zmniejsza czcionkę", () => {
    expect(fitText("Konstantynopolitańczyk", opts, measure).size).toBe(10);
  });

  it("za długi tekst kończy się wielokropkiem i nie wychodzi poza szerokość", () => {
    const res = fitText("bardzo długa nazwa firmy której nie da się zmieścić w dwóch krótkich wierszach etykiety", opts, measure);
    expect(res.size).toBe(10);
    expect(res.lines).toHaveLength(2);
    expect(res.lines[1].endsWith("…")).toBe(true);
    for (const line of res.lines) expect(measure(line, res.size)).toBeLessThanOrEqual(100);
  });
});

describe("drukarka", () => {
  it("etykieta 50×30 mm dla B1: 8 px/mm", () => {
    expect([B1_LABEL_SIZE.w_px, B1_LABEL_SIZE.h_px]).toEqual([384, 240]);
  });

  it("anulowane okno wyboru bez komunikatu, reszta po polsku", () => {
    const err = (name: string, message: string) => Object.assign(new Error(message), { name });
    expect(printerErrorMessage(err("NotFoundError", "User cancelled the requestDevice() chooser."))).toBeNull();
    expect(printerErrorMessage(err("NotFoundError", "No devices found"))).toMatch(/Nie znaleziono drukarki/);
    expect(printerErrorMessage(err("Error", "Not connected — the link dropped"))).toMatch(/przerwane/);
    expect(printerErrorMessage(err("Error", "print not confirmed: x"))).toMatch(/nie potwierdziła/);
  });
});

describe("dane etykiety — dostęp", () => {
  const label = {
    name: "Żaneta Grzęślewicz",
    company: "Firma",
    eventName: "Next Stop Łódź",
    qrUrl: "https://eventro.pl/e/next-stop-lodz/connect/ABC123",
  };

  it("organizator i link recepcji dostają etykietę z adresem wymiany kontaktów", async () => {
    expect(await organizer.organizerBadgeLabel("event-a", "att-1")).toEqual({ ok: true, label });
    expect(await staff.staffBadgeLabel("tok", "att-1")).toEqual({ ok: true, label });
  });

  it("nie właściciel albo nieaktywny link → bez odczytu uczestnika", async () => {
    own.event = null;
    expect(await organizer.organizerBadgeLabel("event-a", "att-1")).toMatchObject({ ok: false });
    expect(await staff.staffBadgeLabel("zly-token", "att-1")).toMatchObject({ ok: false });
    expect(db.queries.some((q) => q.table === "attendees")).toBe(false);
  });

  it("plan bez identyfikatorów → odmowa", async () => {
    feature.on = false;
    expect(await organizer.organizerBadgeLabel("event-a", "att-1")).toEqual({ ok: false, error: "Funkcja niedostępna w planie." });
    expect(await staff.staffBadgeLabel("tok", "att-1")).toEqual({ ok: false, error: "Funkcja niedostępna w planie." });
  });

  it("uczestnik innego wydarzenia → brak danych", async () => {
    own.event = { ...event, id: "event-b" };
    expect(await organizer.organizerBadgeLabel("event-b", "att-1")).toMatchObject({ ok: false });
  });

  it("uczestnik niezatwierdzony → brak danych", async () => {
    db.rows.attendees = () => ({ ...attendee, status: "pending" });
    expect(await staff.staffBadgeLabel("tok", "att-1")).toMatchObject({ ok: false });
  });
});
