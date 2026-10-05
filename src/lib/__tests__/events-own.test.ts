import { describe, it, expect, vi, beforeEach } from "vitest";

// getOwnEvent: polityka „public can view published events” obejmuje authenticated,
// więc sam odczyt przez RLS zwróciłby cudzy opublikowany event — wymagane jawne
// sprawdzenie właściciela organizacji.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("@/lib/suspension", () => ({ redirectIfSuspended: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const state = { event: null as null | { id: string; organization_id: string }, ownerOrg: null as null | string, user: "u1" as string | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const b = {
        select: () => b,
        is: () => b,
        eq: (k: string, v: unknown) => ((filters[k] = v), b),
        maybeSingle: async () => {
          if (table === "events") return { data: state.event, error: null };
          const ok = filters.id === state.ownerOrg && filters.owner_user_id === state.user;
          return { data: ok ? { id: filters.id } : null, error: null };
        },
      };
      return b;
    },
  }),
}));

const { getOwnEvent } = await import("../events");

beforeEach(() => {
  state.event = { id: "ev1", organization_id: "org1" };
  state.ownerOrg = "org1";
  state.user = "u1";
});

describe("getOwnEvent", () => {
  it("właściciel organizacji → event", async () => {
    expect(await getOwnEvent("ev1")).toMatchObject({ id: "ev1" });
  });

  it("cudzy opublikowany event widoczny przez RLS → null", async () => {
    state.ownerOrg = "inna-org";
    expect(await getOwnEvent("ev1")).toBeNull();
  });

  it("brak eventu → null", async () => {
    state.event = null;
    expect(await getOwnEvent("ev1")).toBeNull();
  });
});
