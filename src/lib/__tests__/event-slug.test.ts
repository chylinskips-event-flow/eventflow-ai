import { beforeEach, describe, expect, it, vi } from "vitest";

// Dostępność adresu strony wydarzenia: sprawdzenie w całej bazie (service_role) z pominięciem
// edytowanego wydarzenia, propozycja wolnego wariantu z numerem.

const existing: { id: string; slug: string }[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filters = { in: [] as string[], neq: null as string | null };
      const b = {
        select: () => b,
        in: (_k: string, v: string[]) => ((filters.in = v), b),
        neq: (_k: string, v: string) => ((filters.neq = v), b),
        then: (resolve: (r: unknown) => unknown) =>
          resolve({
            data: existing.filter((e) => filters.in.includes(e.slug) && e.id !== filters.neq).map((e) => ({ slug: e.slug })),
            error: null,
          }),
      };
      return b;
    },
  }),
}));

const { checkEventSlug, suggestEventSlug, takenSlugMessage } = await import("@/lib/event-slug");

beforeEach(() => {
  existing.length = 0;
});

describe("adres strony wydarzenia", () => {
  it("wolny adres", async () => {
    expect(await checkEventSlug("targi-lodz")).toEqual({ status: "available" });
  });

  it("zajęty u innego organizatora → propozycja z numerem", async () => {
    existing.push({ id: "e1", slug: "targi-lodz" }, { id: "e2", slug: "targi-lodz-2" });
    expect(await checkEventSlug("targi-lodz")).toEqual({ status: "taken", suggestion: "targi-lodz-3" });
  });

  it("własny adres edytowanego wydarzenia nie jest „zajęty”", async () => {
    existing.push({ id: "e1", slug: "targi-lodz" });
    expect(await checkEventSlug("targi-lodz", "e1")).toEqual({ status: "available" });
  });

  it("niepoprawny lub zarezerwowany adres → komunikat walidacji", async () => {
    expect(await checkEventSlug("Targi Łódź")).toMatchObject({ status: "invalid" });
    expect(await checkEventSlug("admin")).toMatchObject({ status: "invalid", message: expect.stringMatching(/zarezerwowany/) });
  });

  it("komunikat dla zajętego adresu", async () => {
    expect(takenSlugMessage("targi-3")).toBe("Ten adres jest zajęty — spróbuj: targi-3");
    expect(takenSlugMessage(null)).toBe("Ten adres jest zajęty — wybierz inny.");
    expect(await suggestEventSlug("abc")).toBe("abc-2");
  });
});
