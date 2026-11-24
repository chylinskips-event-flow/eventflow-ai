import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "@/lib/fetch-all-rows";

// Stronicowanie zapytań: PostgREST oddaje najwyżej 1000 wierszy na odpowiedź (bez błędu).

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

/** Atrapa PostgREST: obcina każdą odpowiedź do 1000 wierszy, jak max_rows. */
const server = (all: { id: number }[]) => (from: number, to: number) =>
  Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null });

describe("fetchAllRows", () => {
  it("2500 wierszy → wszystkie, w kolejności, 3 strony", async () => {
    const page = vi.fn(server(rows(2500)));
    const { data, error } = await fetchAllRows(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(data.at(-1)).toEqual({ id: 2499 });
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("dokładnie 1000 → dodatkowe puste zapytanie kończy pętlę", async () => {
    const page = vi.fn(server(rows(1000)));
    expect((await fetchAllRows(page)).data).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("błąd na kolejnej stronie → błąd zwrócony", async () => {
    let n = 0;
    const res = await fetchAllRows(() =>
      Promise.resolve(n++ === 0 ? { data: rows(1000), error: null } : { data: null, error: { message: "boom" } }),
    );
    expect(res.error).toEqual({ message: "boom" });
  });

  it("bezpiecznik liczby stron", async () => {
    const page = vi.fn(() => Promise.resolve({ data: rows(10), error: null }));
    await fetchAllRows(page, { pageSize: 10, maxPages: 3 });
    expect(page).toHaveBeenCalledTimes(3);
  });
});

// ── PDF identyfikatorów: wszyscy uczestnicy, nie tylko pierwsze 1000 ─────────

const pdf = vi.hoisted(() => ({ attendees: 0, ranges: [] as number[][], orders: [] as string[] }));

vi.mock("@/lib/events", () => ({
  getOwnEvent: async () => ({ id: "ev", organization_id: "org", slug: "konf", name: "Konf" }),
}));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64," } }));
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: async (el: { props: { attendees: unknown[] } }) => {
    pdf.attendees = el.props.attendees.length;
    return Buffer.from("%PDF");
  },
}));
vi.mock("@/app/(organizer)/admin/events/[eventId]/badges/badge-pdf", () => ({ BadgesPdf: () => null }));
vi.mock("@/lib/supabase/admin", () => {
  const all = Array.from({ length: 2345 }, (_, i) => ({ id: `a${i}`, contact_code: `c${i}` }));
  return {
    createAdminClient: () => ({
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          not: () => b,
          order: (col: string) => (pdf.orders.push(col), b),
          range: (from: number, to: number) => {
            pdf.ranges.push([from, to]);
            return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null });
          },
        };
        return b;
      },
    }),
  };
});

describe("PDF identyfikatorów", () => {
  beforeEach(() => {
    pdf.attendees = 0;
    pdf.ranges = [];
    pdf.orders = [];
  });

  it("ponad 1000 uczestników → wszyscy w PDF", async () => {
    const { GET } = await import("@/app/(organizer)/admin/events/[eventId]/badges/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/admin/events/ev/badges?filter=all"), {
      params: Promise.resolve({ eventId: "ev" }),
    });
    expect(res.status).toBe(200);
    expect(pdf.attendees).toBe(2345);
    expect(pdf.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // Stały porządek stron: nazwisko, imię, id.
    expect(pdf.orders.slice(0, 3)).toEqual(["last_name", "first_name", "id"]);
  });
});
