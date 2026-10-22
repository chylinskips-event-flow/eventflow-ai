import { describe, it, expect, vi, beforeEach } from "vitest";

// Ponowna rejestracja na ten sam adres w tym samym wydarzeniu: bez nowego rekordu, link do panelu.

type Row = { id: string; event_id: string; email: string; status: string };
const db = { attendees: [] as Row[], events: [] as { id: string; slug: string; requires_approval: boolean }[] };
const inserted: Row[] = [];
const requestAccessLinkForEmail = vi.fn<(p: { slug: string; email: unknown }) => Promise<{ status: "sent" }>>(
  async () => ({ status: "sent" }),
);

function unescapeLike(pattern: string) {
  return pattern.replace(/\\(.)/g, "$1");
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: "attendees" | "events") => {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      let insertRow: Row | null = null;
      const rows = () => (db[table] as Record<string, unknown>[]).filter((r) => filters.every((f) => f(r)));
      const b = {
        select: () => b,
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
        ilike: (col: string, pattern: string) => (
          filters.push((r) => String(r[col]).toLowerCase() === unescapeLike(pattern).toLowerCase()), b
        ),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: insertRow ? { qr_code_token: "qr-new", check_in_token: "ci-new" } : null, error: null }),
        insert: (row: Omit<Row, "id">) => {
          insertRow = { id: `a${inserted.length + 1}`, ...row };
          inserted.push(insertRow);
          db.attendees.push(insertRow);
          return b;
        },
        then: (resolve: (v: { count: number; data: unknown; error: null }) => unknown) =>
          resolve({ count: rows().length, data: rows(), error: null }),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/access-link", () => ({
  escapeLike: (v: string) => v.replace(/[\\%_]/g, (c) => "\\" + c),
  requestAccessLinkForEmail: (p: { slug: string; email: unknown }) => requestAccessLinkForEmail(p),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4", origin: "https://eventro.pl" }),
  cookies: async () => ({ set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/email/attendee-confirmation", () => ({
  sendAttendeeConfirmationEmail: async () => {},
  sendAttendeePendingApprovalEmail: async () => {},
}));
vi.mock("@/lib/entitlements", () => ({ ATTENDEE_LIMIT_MESSAGE: "limit", isAttendeeLimitReached: async () => false }));

const { registerAttendee } = await import("../actions");
const { DUPLICATE_REGISTRATION_MESSAGE } = await import("@/lib/duplicate-registration");

function form(email: string) {
  const fd = new FormData();
  fd.set("first_name", "Ania");
  fd.set("last_name", "Nowak");
  fd.set("email", email);
  fd.set("gdpr_consent", "on");
  return fd;
}

async function register(eventId: string, slug: string, email: string) {
  try {
    return await registerAttendee(eventId, slug, { status: "idle" }, form(email));
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") return { status: "redirect" as const };
    throw e;
  }
}

beforeEach(() => {
  db.events = [
    { id: "ev1", slug: "expo", requires_approval: false },
    { id: "ev2", slug: "inne", requires_approval: false },
  ];
  db.attendees = [{ id: "a0", event_id: "ev1", email: "ania@example.com", status: "approved" }];
  inserted.length = 0;
  requestAccessLinkForEmail.mockClear();
});

describe("rejestracja — duplikaty adresu w jednym wydarzeniu", () => {
  it("ten sam adres: nie tworzy rekordu, wysyła link do panelu i pokazuje komunikat", async () => {
    const res = await register("ev1", "expo", "ania@example.com");
    expect(res).toEqual({ status: "already_registered", message: DUPLICATE_REGISTRATION_MESSAGE });
    expect(inserted).toHaveLength(0);
    expect(requestAccessLinkForEmail).toHaveBeenCalledTimes(1);
    expect(requestAccessLinkForEmail.mock.calls[0][0]).toMatchObject({ slug: "expo" });
  });

  it("wielkość liter i spacje nie omijają blokady", async () => {
    const res = await register("ev1", "expo", "  ANIA@Example.COM  ");
    expect(res.status).toBe("already_registered");
    expect(inserted).toHaveLength(0);
  });

  it("uczestnik oczekujący też blokuje ponowną rejestrację", async () => {
    db.attendees = [{ id: "a0", event_id: "ev1", email: "ania@example.com", status: "pending" }];
    expect((await register("ev1", "expo", "ania@example.com")).status).toBe("already_registered");
    expect(inserted).toHaveLength(0);
  });

  it("odrzucony uczestnik może zarejestrować się ponownie (jak dotąd)", async () => {
    db.attendees = [{ id: "a0", event_id: "ev1", email: "ania@example.com", status: "rejected" }];
    expect((await register("ev1", "expo", "ania@example.com")).status).toBe("redirect");
    expect(inserted).toHaveLength(1);
  });

  it("inny adres: tworzy rekord normalnie, bez linku", async () => {
    expect((await register("ev1", "expo", "jan@example.com")).status).toBe("redirect");
    expect(inserted).toHaveLength(1);
    expect(requestAccessLinkForEmail).not.toHaveBeenCalled();
  });

  it("ten sam adres w INNYM wydarzeniu: rejestruje normalnie", async () => {
    expect((await register("ev2", "inne", "ania@example.com")).status).toBe("redirect");
    expect(inserted).toHaveLength(1);
    expect(inserted[0].event_id).toBe("ev2");
  });

  it("symbole % i _ w adresie nie działają jak wieloznaczne", async () => {
    db.attendees = [{ id: "a0", event_id: "ev1", email: "a_b@example.com", status: "approved" }];
    expect((await register("ev1", "expo", "a%b@example.com")).status).toBe("redirect");
    expect(inserted).toHaveLength(1);
  });
});
