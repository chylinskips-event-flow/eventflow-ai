import { beforeEach, describe, expect, it, vi } from "vitest";

// Sesja uczestnika: osobne cookie na wydarzenie, dawne wspólne cookie nadal działa
// dla swojego wydarzenia i jest leniwie przenoszone do cookie wydarzenia.

type Att = { id: string; qr_code_token: string; status: string; slug: string };
const db = { attendees: [] as Att[] };
const jar = new Map<string, string>();
const store = {
  writable: true,
  get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
  set: (name: string, value: string) => {
    if (!store.writable) throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    jar.set(name, value);
  },
  delete: ({ name }: { name: string }) => void jar.delete(name),
};

vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const f: Record<string, string> = {};
      const b = {
        select: () => b,
        eq: (c: string, v: string) => ((f[c] = v), b),
        maybeSingle: async () => {
          const a = db.attendees.find((x) => x.qr_code_token === f.qr_code_token && x.slug === f["events.slug"]);
          if (!a) return { data: null, error: null };
          const { slug, ...rest } = a;
          return { data: { ...rest, events: { slug } }, error: null };
        },
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

beforeEach(() => {
  jar.clear();
  store.writable = true;
  db.attendees = [
    { id: "a1", qr_code_token: "tok-a", status: "approved", slug: "konf-a" },
    { id: "b1", qr_code_token: "tok-b", status: "approved", slug: "konf-b" },
    { id: "c1", qr_code_token: "tok-c", status: "pending", slug: "konf-c" },
  ];
});

describe("cookie sesji uczestnika per wydarzenie", () => {
  it("nazwa zależy od wydarzenia i różni się od dawnej wspólnej", () => {
    expect(attendeeCookieName("konf-a")).not.toBe(attendeeCookieName("konf-b"));
    expect(attendeeCookieName("konf-a")).not.toBe(ATTENDEE_TOKEN_COOKIE);
    expect(attendeeCookieName("Konf A;x")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("wejście do drugiego wydarzenia nie wylogowuje z pierwszego", async () => {
    setAttendeeSessionCookie(store, "konf-a", "tok-a");
    setAttendeeSessionCookie(store, "konf-b", "tok-b");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect((await getCurrentAttendee("konf-b"))?.id).toBe("b1");
  });

  it("token innego wydarzenia nie loguje", async () => {
    jar.set(attendeeCookieName("konf-a"), "tok-b");
    expect(await getCurrentAttendee("konf-a")).toBeNull();
  });

  it("uczestnik oczekujący nie jest zalogowany", async () => {
    setAttendeeSessionCookie(store, "konf-c", "tok-c");
    expect(await getCurrentAttendee("konf-c")).toBeNull();
  });

  it("dawne wspólne cookie działa dla swojego wydarzenia i jest przenoszone do cookie wydarzenia", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect(jar.get(attendeeCookieName("konf-a"))).toBe("tok-a");
    expect(await getCurrentAttendee("konf-b")).toBeNull();
  });

  it("dawne cookie obok cookie innego wydarzenia — oba wydarzenia zalogowane", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    setAttendeeSessionCookie(store, "konf-b", "tok-b");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect((await getCurrentAttendee("konf-b"))?.id).toBe("b1");
  });

  it("w komponencie serwerowym (zapis cookie rzuca) dawne cookie nadal loguje", async () => {
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    store.writable = false;
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
    expect(jar.has(attendeeCookieName("konf-a"))).toBe(false);
  });

  it("nieaktualne cookie wydarzenia — sprawdzane jest jeszcze dawne cookie", async () => {
    jar.set(attendeeCookieName("konf-a"), "tok-usuniety");
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    expect((await getCurrentAttendee("konf-a"))?.id).toBe("a1");
  });

  it("usunięcie sesji czyści cookie wydarzenia i dawne cookie tylko z tokenem tego uczestnika", async () => {
    setAttendeeSessionCookie(store, "konf-a", "tok-a");
    setAttendeeSessionCookie(store, "konf-b", "tok-b");
    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-a");
    await clearAttendeeSession("konf-a", "tok-a");
    expect(jar.has(attendeeCookieName("konf-a"))).toBe(false);
    expect(jar.has(ATTENDEE_TOKEN_COOKIE)).toBe(false);
    expect(jar.get(attendeeCookieName("konf-b"))).toBe("tok-b");

    jar.set(ATTENDEE_TOKEN_COOKIE, "tok-b");
    await clearAttendeeSession("konf-a", "tok-a");
    expect(jar.get(ATTENDEE_TOKEN_COOKIE)).toBe("tok-b");
  });
});
