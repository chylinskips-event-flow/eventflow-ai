import { describe, it, expect, vi } from "vitest";

// Konto z dwiema organizacjami (dawny podwójny zapis onboardingu) nie może tracić dostępu do
// panelu: getOwnOrganization wybiera deterministycznie najstarszą zamiast błędu maybeSingle().

const calls: [string, ...unknown[]][] = [];

vi.mock("@/lib/suspension", () => ({ redirectIfSuspended: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, (...args: unknown[]) => unknown> = {};
    for (const m of ["from", "select", "eq", "order", "limit"]) {
      q[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return q;
      };
    }
    q.maybeSingle = async () => {
      calls.push(["maybeSingle"]);
      // maybeSingle() zwraca błąd przy >1 wierszu — tu symulujemy wynik po limit(1).
      const limited = calls.some(([m, n]) => m === "limit" && n === 1);
      return limited
        ? { data: { id: "org-old" }, error: null }
        : { data: null, error: { code: "PGRST116", message: "multiple rows" } };
    };
    return { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, ...q };
  },
}));

const { getOwnOrganization } = await import("../organizations");

describe("getOwnOrganization", () => {
  it("dwie organizacje jednego konta → najstarsza (created_at, id), bez błędu", async () => {
    const org = await getOwnOrganization();
    expect(org).toEqual({ id: "org-old" });
    expect(calls).toContainEqual(["eq", "owner_user_id", "u1"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: true }]);
    expect(calls).toContainEqual(["order", "id", { ascending: true }]);
    expect(calls).toContainEqual(["limit", 1]);
  });
});
