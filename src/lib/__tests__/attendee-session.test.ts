import { beforeEach, describe, expect, it, vi } from "vitest";

// Sesja uczestnika: osobne cookie na wydarzenie (nazwane po id wydarzenia), dawne wspólne
// cookie nadal działa dla swojego wydarzenia (gdy brak cookie wydarzenia) i jest leniwie
// przenoszone do cookie wydarzenia.

type Att = { id: string; qr_code_token: string; status: string; event_id: string };
const db = {
  events: [] as { id: string; slug: string }[],
  attendees: [] as Att[],
};
const jar = new Map<string, string>();
const store = {
  writable: true,
  get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => {
    if (!store.writable) throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    jar.set(name, value);
  },
  delete: ({ name }: { name: string }) => void jar.delete(name),
};

function withEvent(a: Att) {
  const slug = db.events.find((e) => e.id === a.event_id)!.slug;
  return { ...a, events: { slug } };
}

vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const f: Record<string, string> = {};
      let tokens: string[] | null = null;
      const matching = () =>
        db.attendees
          .filter((a) => (tokens ? tokens.includes(a.qr_code_token) : a.qr_code_token === f.qr_code_token))
          .map(withEvent)
          .filter((a) => a.events.slug === f["events.slug"]);
      const b = {
        select: () => b,
        in: (_c: string, v: string[]) => ((tokens = v), b),
        eq: (c: string, v: string) => ((f[c] = v), b),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: matching(), error: null }),
      };
      return b;
    },
  }),
}));

const {
  ATTENDEE_TOKEN_COOKIE,
  attendeeCookieName,
  setAttendeeSessionCookie,
  getCurrentAttendee,
  clearAttendeeSession,
} = await import("@/lib/attendee-session");

const EA = "11111111-1111-4111-8111-111111111111";
const EB = "22222222-2222-4222-8222-222222222222";
const EC = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  jar.clear();
  store.writable = true;
  db.events = [
    { id: EA, slug: "konf-a" },
    { id: EB, slug: "konf-b" },
    { id: EC, slug: "konf-c" },
  ];
  db.attendees = [
    { id: "a1", qr_code_token: "tok-a", status: "approved", event_id: EA },
    { id: "a2", qr_code_token: "tok-a-pending", status: "pending", event_id: EA },
    { id: "b1", qr_code_token: "tok-b", status: "approved", event_id: EB },
    { id: "c1", qr_code_token: "tok-c", status: "pending", event_id: EC },
  ];
});

describe("cookie sesji uczestnika per wydarzenie", () => {
  it("nazwa zależy od id wydarzenia i różni się od dawnej wspólnej", () => {
    expect(attendeeCookieName(EA)).not.toBe(attendeeCookieName(EB));
    expect(attendeeCookieName(EA)).not.toBe(ATTENDEE_TOKEN_COOKIE);
    expect(attendeeCookieName("Konf A;x")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("wejście do drugiego wydarzenia nie wylogowuje z pierwszego", async () => {
    setAttendeeSessionCookie(store, EA, "tok-a");
    setAttendeeSessionCookie(store, EB, "tok-b");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect((await getCurrentAttendee("konf-b"))?.id).toBe("b1");
  });

  it("sesja przetrwa zmianę slug wydarzenia", async () => {
    setAttendeeSessionCookie(store, EA, "tok-a");
    db.events[0].slug = "konf-a-nowa";
    expect((await getCurrentAttendee("konf-a-nowa"))?.id).toBe("a1");
    expect(await getCurrentAttendee("konf-a")).toBeNull();
  });

  it("token innego wydarzenia nie loguje", async () => {
    jar.set(attendeeCookieName(EA), "tok-b");
    expect(await getCurrentAttendee("konf-a")).toBeNull();
  });

  it("uczestnik oczekujący nie jest zalogowany", async () => {
    setAttendeeSessionCookie(store, EC, "tok-c");
    expect(await getCurrentAttendee("konf-c")).toBeNull();
  });

  it("dawne wspólne cookie działa dla swojego wydarzenia i jest przenoszone do cookie wydarzenia", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect(jar.get(attendeeCookieName(EA))).toBe("tok-a");
    expect(await getCurrentAttendee("konf-b")).toBeNull();
  });

  it("dawne cookie obok cookie innego wydarzenia — oba wydarzenia zalogowane", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    setAttendeeSessionCookie(store, EB, "tok-b");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect((await getCurrentAttendee("konf-b"))?.id).toBe("b1");
  });

  it("w komponencie serwerowym (zapis cookie rzuca) dawne cookie nadal loguje", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    store.writable = false;
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect(jar.has(attendeeCookieName(EA))).toBe(false);
  });

  it("oczekujący token w cookie wydarzenia — dawne cookie innej osoby nie loguje i nie nadpisuje cookie", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    setAttendeeSessionCookie(store, EA, "tok-a-pending");
    expect(await getCurrentAttendee("konf-a")).toBeNull();
    expect(jar.get(attendeeCookieName(EA))).toBe("tok-a-pending");
    // po zatwierdzeniu ta sama przeglądarka loguje właściwą osobę
    db.attendees[1].status = "approved";
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a2");
  });

  it("nieaktualne cookie wydarzenia — dawne cookie nie jest używane", async () => {
    jar.set(attendeeCookieName(EA), "tok-usuniety");
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    expect(await getCurrentAttendee("konf-a")).toBeNull();
    expect(jar.get(attendeeCookieName(EA))).toBe("tok-usuniety");
  });

  it("wartości cookie o złym formacie są pomijane", async () => {
    jar.set(attendeeCookieName(EB), "x,y(\"z)");
    setAttendeeSessionCookie(store, EA, "tok-a");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
  });

  it("usunięcie sesji czyści cookie wydarzenia i dawne cookie tylko z tokenem tego uczestnika", async () => {
    setAttendeeSessionCookie(store, EA, "tok-a");
    setAttendeeSessionCookie(store, EB, "tok-b");
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    await clearAttendeeSession(EA, "tok-a");
    expect(jar.has(attendeeCookieName(EA))).toBe(false);
    expect(jar.has(ATTENDEE_TOKEN_COOKIE)).toBe(false);
    expect(jar.get(attendeeCookieName(EB))).toBe("tok-b");

    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-b");
    await clearAttendeeSession(EA, "tok-a");
    expect(jar.get(ATTENDEE_TOKEN_COOKIE)).toBe("tok-b");
  });
});
