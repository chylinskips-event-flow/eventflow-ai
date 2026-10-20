import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestAccessLinkCore,
  hashForRateLimit,
  clientIpFromHeaders,
  ACCESS_LINK_MAX_PER_EMAIL,
  ACCESS_LINK_MAX_PER_IP,
  ACCESS_LINK_SENT_MESSAGE,
  type AccessLinkDeps,
  type AccessLinkEvent,
} from "../access-link-core";

const EVENT: AccessLinkEvent = { id: "ev1", name: "Expo", slug: "expo", status: "published" };
const REGISTERED = "ania@example.com";

type Row = { eventId: string; emailHash: string; ipHash: string; at: number };

function makeDeps(over: Partial<AccessLinkDeps> = {}) {
  const rows: Row[] = [];
  const tasks: (() => Promise<void>)[] = [];
  let clock = Date.parse("2026-10-20T10:00:00Z");
  const sendLink = vi.fn(async () => {});
  const deps: AccessLinkDeps = {
    findEvent: async (slug) => (slug === EVENT.slug ? EVENT : null),
    isSuspended: async () => false,
    countRecent: async ({ emailHash, ipHash, since }) => ({
      email: rows.filter((r) => r.emailHash === emailHash && r.at >= since.getTime()).length,
      ip: rows.filter((r) => r.ipHash === ipHash && r.at >= since.getTime()).length,
    }),
    record: async ({ eventId, emailHash, ipHash }) => {
      rows.push({ eventId, emailHash, ipHash, at: clock });
    },
    findApprovedAttendee: async (eventId, email) =>
      eventId === EVENT.id && email === REGISTERED
        ? { first_name: "Ania", email: "Ania@Example.com", qr_code_token: "tok-1" }
        : null,
    sendLink,
    schedule: (task) => void tasks.push(task),
    now: () => new Date(clock),
    ...over,
  };
  const flush = async () => {
    while (tasks.length) await tasks.shift()!();
  };
  return { deps, rows, tasks, sendLink, flush, advance: (ms: number) => (clock += ms) };
}

const req = (email: unknown, ip = "1.2.3.4", slug = "expo") => ({ slug, email, ip });

describe("requestAccessLinkCore — „Wejdź ponownie”", () => {
  let t: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    t = makeDeps();
  });

  it("zarejestrowany adres: wysyła link po odpowiedzi (wielkość liter i spacje bez znaczenia)", async () => {
    const res = await requestAccessLinkCore(t.deps, req("  ANIA@example.com "));
    expect(res).toEqual({ status: "sent", message: ACCESS_LINK_SENT_MESSAGE });
    expect(t.sendLink).not.toHaveBeenCalled(); // wysyłka dopiero po odpowiedzi (after)
    await t.flush();
    expect(t.sendLink).toHaveBeenCalledTimes(1);
    expect(t.sendLink).toHaveBeenCalledWith({
      attendee: { first_name: "Ania", email: "Ania@Example.com", qr_code_token: "tok-1" },
      event: EVENT,
    });
  });

  it("nieznany adres: nic nie wysyła", async () => {
    await requestAccessLinkCore(t.deps, req("obcy@example.com"));
    await t.flush();
    expect(t.sendLink).not.toHaveBeenCalled();
  });

  it("odpowiedź identyczna dla adresu znanego i nieznanego (treść, status, ta sama ścieżka zapisu)", async () => {
    const known = await requestAccessLinkCore(t.deps, req(REGISTERED, "1.1.1.1"));
    const unknown = await requestAccessLinkCore(t.deps, req("obcy@example.com", "2.2.2.2"));
    expect(JSON.stringify(unknown)).toBe(JSON.stringify(known));
    // Obie prośby zliczone do limitu i obie zaplanowały wyszukanie dopiero po odpowiedzi.
    expect(t.rows).toHaveLength(2);
    expect(t.tasks).toHaveLength(2);
  });

  it("limit na adres: po 3 prośbach w 15 min kolejna odrzucona — także dla nieznanego adresu", async () => {
    for (const email of [REGISTERED, "obcy@example.com"]) {
      const local = makeDeps();
      for (let i = 0; i < ACCESS_LINK_MAX_PER_EMAIL; i++) {
        expect((await requestAccessLinkCore(local.deps, req(email, `10.0.0.${i}`))).status).toBe("sent");
      }
      const blocked = await requestAccessLinkCore(local.deps, req(email, "10.0.0.99"));
      expect(blocked.status).toBe("rate_limited");
      expect(local.tasks).toHaveLength(ACCESS_LINK_MAX_PER_EMAIL);
    }
  });

  it("limit mija po 15 minutach", async () => {
    for (let i = 0; i < ACCESS_LINK_MAX_PER_EMAIL; i++) await requestAccessLinkCore(t.deps, req(REGISTERED));
    expect((await requestAccessLinkCore(t.deps, req(REGISTERED))).status).toBe("rate_limited");
    t.advance(15 * 60_000 + 1);
    expect((await requestAccessLinkCore(t.deps, req(REGISTERED))).status).toBe("sent");
  });

  it("limit na IP: różne adresy z jednego IP", async () => {
    for (let i = 0; i < ACCESS_LINK_MAX_PER_IP; i++) {
      expect((await requestAccessLinkCore(t.deps, req(`osoba${i}@example.com`))).status).toBe("sent");
    }
    expect((await requestAccessLinkCore(t.deps, req("kolejna@example.com"))).status).toBe("rate_limited");
  });

  it("nie przechowuje surowego e-maila ani IP — tylko hashe", async () => {
    await requestAccessLinkCore(t.deps, req(REGISTERED, "9.9.9.9"));
    expect(t.rows[0].emailHash).toBe(hashForRateLimit("email", REGISTERED));
    expect(JSON.stringify(t.rows)).not.toContain("example.com");
    expect(JSON.stringify(t.rows)).not.toContain("9.9.9.9");
  });

  it("niepoprawny e-mail: komunikat walidacji, bez zapisu i wysyłki", async () => {
    for (const bad of ["", "ania", "a@b", null, 42]) {
      expect((await requestAccessLinkCore(t.deps, req(bad))).status).toBe("invalid");
    }
    expect(t.rows).toHaveLength(0);
  });

  it("szkic, zawieszone lub nieistniejące wydarzenie: neutralny komunikat, nic się nie dzieje", async () => {
    const draft = makeDeps({ findEvent: async () => ({ ...EVENT, status: "draft" }) });
    const suspended = makeDeps({ isSuspended: async () => true });
    const cases: [ReturnType<typeof makeDeps>, string][] = [[draft, "expo"], [suspended, "expo"], [t, "brak"]];
    for (const [d, slug] of cases) {
      const res = await requestAccessLinkCore(d.deps, req(REGISTERED, "1.2.3.4", slug));
      expect(res.status).toBe("unavailable");
      expect(d.rows).toHaveLength(0);
      expect(d.tasks).toHaveLength(0);
    }
  });

  it("po evencie (completed) uczestnik nadal może poprosić o link", async () => {
    const done = makeDeps({ findEvent: async () => ({ ...EVENT, status: "completed" }) });
    expect((await requestAccessLinkCore(done.deps, req(REGISTERED))).status).toBe("sent");
  });

  it("awaria tabeli limitu (np. brak migracji): błąd, bez wysyłki", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = makeDeps({
      countRecent: async () => {
        throw new Error("relation does not exist");
      },
    });
    const res = await requestAccessLinkCore(broken.deps, req(REGISTERED));
    expect(res.status).toBe("error");
    expect(broken.tasks).toHaveLength(0);
    spy.mockRestore();
  });

  it("błąd wysyłki maila nie zmienia odpowiedzi (dzieje się po niej)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = makeDeps({
      sendLink: async () => {
        throw new Error("Resend down");
      },
    });
    const res = await requestAccessLinkCore(failing.deps, req(REGISTERED));
    expect(res.status).toBe("sent");
    await failing.flush();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("clientIpFromHeaders", () => {
  it("pierwszy adres z x-forwarded-for, potem x-real-ip", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "5.5.5.5, 10.0.0.1" }))).toBe("5.5.5.5");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "6.6.6.6" }))).toBe("6.6.6.6");
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
