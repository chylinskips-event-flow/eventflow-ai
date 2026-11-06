import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeGuestFile, GUEST_IMPORT_MAX, parseGuestList } from "@/lib/guest-import-core";

// Import listy gości i wysyłka biletów. Bez bazy i bez maili: atrapy klienta i wysyłki.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const db = { attendees: [] as Row[], failInsert: false };
const mail = { sent: [] as string[], failFor: new Set<string>() };
const plan = { limit: null as number | null };

function builder() {
  const filters: Filter[] = [];
  let action: "select" | "update" | "insert" = "select";
  let payload: Row | Row[] = {};
  let head = false;
  let returning = false;
  let max = Infinity;
  const rows = () => db.attendees.filter((r) => filters.every((f) => f(r)));

  const run = () => {
    if (action === "insert") {
      if (db.failInsert) return { error: { message: "x" } };
      db.attendees.push(...(payload as Row[]).map((r, i) => ({ id: `new-${db.attendees.length + i}`, ticket_sent_at: null, ...r })));
      return { error: null };
    }
    if (action === "update") {
      const hit = rows();
      hit.forEach((r) => Object.assign(r, payload));
      return { data: returning ? hit : null, error: null };
    }
    return head ? { count: rows().length, error: null } : { data: rows().slice(0, max), error: null };
  };

  const b: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => {
      if (action === "update") returning = true;
      head = !!o?.head;
      return b;
    },
    insert: (p: Row[]) => ((action = "insert"), (payload = p), b),
    update: (p: Row) => ((action = "update"), (payload = p), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    is: (c: string) => (filters.push((r) => r[c] == null), b),
    not: (c: string) => (filters.push((r) => r[c] != null), b),
    order: () => b,
    limit: (n: number) => ((max = n), b),
    range: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (done: (v: unknown) => unknown) => Promise.resolve(run()).then(done),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => builder() }) }));
vi.mock("@/lib/entitlements", () => ({ getLimit: async () => plan.limit }));
vi.mock("@/lib/duplicate-registration", () => ({ ACTIVE_REGISTRATION_STATUSES: ["pending", "approved"] }));
vi.mock("@/lib/email/attendee-confirmation", () => ({
  sendAttendeeConfirmationEmail: async ({ to }: { to: string }) => {
    if (mail.failFor.has(to)) throw new Error("Resend error");
    mail.sent.push(to);
  },
}));
const own = { event: null as null | Row };
vi.mock("@/lib/events", () => ({ getOwnEvent: async () => own.event }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "eventro.pl" }) }));

const lib = await import("@/lib/guest-import");
const actions = await import("@/app/(organizer)/admin/events/[eventId]/attendees/guest-actions");

const event = { id: "ev", organization_id: "org", slug: "s", name: "E" };
const guest = (email: string) => ({ firstName: "Jan", lastName: "Nowak", email, company: null, jobTitle: null });
const queued = (id: string, over: Row = {}) => ({
  id,
  event_id: "ev",
  email: `${id}@x.pl`,
  first_name: "Jan",
  status: "approved",
  imported_at: "2026-11-06",
  ticket_sent_at: null,
  ...over,
});

beforeEach(() => {
  db.attendees = [];
  db.failInsert = false;
  mail.sent = [];
  mail.failFor = new Set();
  plan.limit = null;
  own.event = event;
  vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true, advanceTimeDelta: 1000 });
});

describe("odczyt listy", () => {
  it("wklejka z Excela z nagłówkiem, kolumny w dowolnej kolejności", () => {
    const { guests, errors } = parseGuestList("Firma\tE-mail\tNazwisko\tImię\nAcme\tJAN@Firma.pl\tNowak\tJan\n");
    expect(errors).toEqual([]);
    expect(guests).toEqual([
      { firstName: "Jan", lastName: "Nowak", email: "jan@firma.pl", company: "Acme", jobTitle: null },
    ]);
  });

  it("CSV ze średnikiem, BOM i polami w cudzysłowach", () => {
    const { guests } = parseGuestList('﻿Imię;Nazwisko;Email;Firma\r\nŻaneta;Łuk;z@x.pl;"Firma; ""Żółć"" sp. z o.o."\r\n');
    expect(guests[0]).toMatchObject({ firstName: "Żaneta", company: 'Firma; "Żółć" sp. z o.o.' });
  });

  it("bez nagłówka: układ wyznacza kolumna z adresem", () => {
    expect(parseGuestList("Jan,Nowak,jan@x.pl,Acme,CEO").guests[0]).toMatchObject({
      firstName: "Jan", lastName: "Nowak", company: "Acme", jobTitle: "CEO",
    });
    expect(parseGuestList("Jan Maria Nowak;jan@x.pl").guests[0]).toMatchObject({
      firstName: "Jan", lastName: "Maria Nowak",
    });
  });

  it("zły wiersz trafia do błędów z numerem, reszta przechodzi", () => {
    const { guests, errors } = parseGuestList(
      "Imię;Nazwisko;Email\nJan;Nowak;jan@x.pl\nAdam;Kot;zly-adres\n;;\nEwa;;ewa@x.pl\nJan;Inny;JAN@x.pl",
    );
    expect(guests).toHaveLength(1);
    expect(errors.map((e) => [e.line, e.reason])).toEqual([
      [3, "Brak poprawnego adresu e-mail"],
      [5, "Brak imienia lub nazwiska"],
      [6, "Ten adres jest już wyżej na liście"],
    ]);
  });

  it("limit wierszy w jednym imporcie", () => {
    const text = Array.from({ length: GUEST_IMPORT_MAX + 1 }, (_, i) => `A;B;a${i}@x.pl`).join("\n");
    const { guests, errors } = parseGuestList(text);
    expect(guests).toHaveLength(GUEST_IMPORT_MAX);
    expect(errors).toHaveLength(1);
  });

  it("plik z polskiego Excela w Windows-1250", () => {
    const bytes = new Uint8Array([0xb3, 0xf3, 0xbf]).buffer; // łóż
    expect(decodeGuestFile(bytes)).toBe("łóż");
    expect(decodeGuestFile(new TextEncoder().encode("łóż").buffer as ArrayBuffer)).toBe("łóż");
  });
});

describe("import", () => {
  it("gość jest zatwierdzony, bez zgód i poza networkingiem; maile nie wychodzą", async () => {
    expect(await lib.importGuests(event, [guest("a@x.pl")])).toEqual({ ok: true, added: 1, skipped: 0 });
    const row = db.attendees[0];
    expect(row).toMatchObject({ status: "approved", networking_visible: false, email: "a@x.pl" });
    expect(row.imported_at).toBeTruthy();
    expect(row.gdpr_consent_at).toBeUndefined();
    expect(mail.sent).toEqual([]);
  });

  it("już zapisany adres jest pomijany bez względu na wielkość liter, odrzucony nie blokuje", async () => {
    db.attendees = [
      { event_id: "ev", email: "A@x.pl", status: "approved" },
      { event_id: "ev", email: "b@x.pl", status: "rejected" },
      { event_id: "inne", email: "c@x.pl", status: "approved" },
    ];
    const result = await lib.importGuests(event, [guest("a@x.pl"), guest("b@x.pl"), guest("c@x.pl")]);
    expect(result).toEqual({ ok: true, added: 2, skipped: 1 });
  });

  it("ponowny import tej samej listy nic nie dubluje", async () => {
    db.attendees = [];
    await lib.importGuests(event, [guest("a@x.pl")]);
    db.attendees[0].event_id = "ev";
    expect(await lib.importGuests(event, [guest("a@x.pl")])).toEqual({ ok: true, added: 0, skipped: 1 });
    expect(db.attendees).toHaveLength(1);
  });

  it("przekroczenie limitu planu: nikt nie zostaje dodany", async () => {
    plan.limit = 1;
    expect(await lib.importGuests(event, [guest("a@x.pl"), guest("b@x.pl")])).toMatchObject({ ok: false });
    expect(db.attendees).toHaveLength(0);
  });

  it("nie właściciel wydarzenia nie importuje i nie wysyła", async () => {
    own.event = null;
    expect(await actions.importGuestList("ev", "Jan;Nowak;a@x.pl")).toMatchObject({ ok: false });
    expect(await actions.sendOneTicket("ev", "a")).toMatchObject({ ok: false });
    await expect(actions.sendTickets("ev", [])).rejects.toThrow();
    expect(db.attendees).toHaveLength(0);
    expect(mail.sent).toEqual([]);
  });
});

describe("wysyłka biletów", () => {
  const ev = event as never;

  it("kolejka to tylko zaimportowani bez biletu i zatwierdzeni", async () => {
    db.attendees = [
      queued("a"),
      queued("sam-sie-zapisal", { imported_at: null }),
      queued("wyslany", { ticket_sent_at: "2026-11-06" }),
      queued("odrzucony", { status: "rejected" }),
      queued("obcy", { event_id: "inne" }),
    ];
    expect(await lib.countTicketQueue("ev")).toBe(1);
    expect(await lib.sendTicketBatch(ev, "https://x", [])).toEqual({ sent: 1, failed: [], remaining: 0 });
    expect(mail.sent).toEqual(["a@x.pl"]);
  });

  it("partia ma limit, kolejne wywołanie wysyła resztę bez powtórek", async () => {
    db.attendees = Array.from({ length: lib.TICKET_BATCH_SIZE + 2 }, (_, i) => queued(`g${i}`));
    const first = await lib.sendTicketBatch(ev, "https://x", []);
    expect(first).toMatchObject({ sent: lib.TICKET_BATCH_SIZE, remaining: 2 });
    await lib.sendTicketBatch(ev, "https://x", []);
    expect(new Set(mail.sent).size).toBe(mail.sent.length);
    expect(mail.sent).toHaveLength(lib.TICKET_BATCH_SIZE + 2);
  }, 30000);

  it("błąd wysyłki zwraca osobę do kolejki, a pominięcie chroni przed zapętleniem", async () => {
    db.attendees = [queued("a"), queued("b")];
    mail.failFor.add("a@x.pl");
    const first = await lib.sendTicketBatch(ev, "https://x", []);
    expect(first).toEqual({ sent: 1, failed: ["a"], remaining: 1 });
    expect(db.attendees[0].ticket_sent_at).toBeNull();
    expect(await lib.sendTicketBatch(ev, "https://x", ["a"])).toEqual({ sent: 0, failed: [], remaining: 1 });
  });

  it("wiersz zajęty przez drugą kartę nie dostaje drugiego maila", async () => {
    db.attendees = [queued("a")];
    await Promise.all([lib.sendTicketBatch(ev, "https://x", []), lib.sendTicketBatch(ev, "https://x", [])]);
    expect(mail.sent).toEqual(["a@x.pl"]);
  });

  it("bilet dla jednej osoby: zatwierdzona dostaje, inna nie", async () => {
    db.attendees = [queued("a", { imported_at: null }), queued("p", { status: "pending" }), queued("o", { event_id: "inne" })];
    expect(await lib.resendTicket(ev, "https://x", "a")).toEqual({ ok: true });
    expect(db.attendees[0].ticket_sent_at).toBeTruthy();
    expect(await lib.resendTicket(ev, "https://x", "p")).toMatchObject({ ok: false });
    expect(await lib.resendTicket(ev, "https://x", "o")).toMatchObject({ ok: false });
    expect(mail.sent).toEqual(["a@x.pl"]);
  });

  it("logi nie zawierają adresu gościa", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.attendees = [queued("a")];
    mail.failFor.add("a@x.pl");
    await lib.sendTicketBatch(ev, "https://x", []);
    expect(JSON.stringify(log.mock.calls)).not.toContain("a@x.pl");
    log.mockRestore();
  });
});
