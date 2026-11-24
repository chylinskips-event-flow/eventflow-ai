import { beforeEach, describe, expect, it, vi } from "vitest";

// Rejestracja organizacji: jedno pole nazwy, slug generowany automatycznie, kolizje i wyścig
// obsłużone ponowną próbą z kolejnym numerem; e-mail do rozliczeń z logowania.
// Zapis idempotentny: konto z organizacją nie zakłada drugiej (podwójne wysłanie formularza).

const inserts: Record<string, unknown>[] = [];
const taken = new Set<string>();
const state = { failOther: false, existingOrg: false, ownerConflict: false };
const partner = { status: "none" as string };

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/partner-portal", () => ({ getPartnerAccountStatus: async () => partner.status }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "anna@firma.pl" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: state.existingOrg ? { id: "org1" } : null, error: null }),
          }),
        }),
      }),
      insert: async (row: { slug: string }) => {
        inserts.push(row);
        if (state.failOther) return { error: { code: "42501", message: "permission denied" } };
        if (state.ownerConflict) {
          return {
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "organizations_owner_user_id_unique"',
              details: "Key (owner_user_id)=(u1) already exists.",
            },
          };
        }
        if (taken.has(row.slug)) {
          return {
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "organizations_slug_key"',
              details: `Key (slug)=(${row.slug}) already exists.`,
            },
          };
        }
        taken.add(row.slug);
        return { error: null };
      },
    }),
  }),
}));

const { createOrganization } = await import("../actions");
const idle = { status: "idle" as const };
const fd = (name: string) => {
  const f = new FormData();
  f.set("name", name);
  return f;
};

beforeEach(() => {
  inserts.length = 0;
  taken.clear();
  state.failOther = false;
  state.existingOrg = false;
  state.ownerConflict = false;
  partner.status = "none";
});

describe("createOrganization", () => {
  it("pusta nazwa → czytelny błąd, bez zapisu", async () => {
    expect(await createOrganization(idle, fd("   "))).toEqual({ status: "error", message: "Podaj nazwę firmy lub marki." });
    expect(inserts).toHaveLength(0);
  });

  it("slug z nazwy (polskie znaki), e-mail do rozliczeń z logowania", async () => {
    await expect(createOrganization(idle, fd("Next Stop Łódź"))).rejects.toThrow("REDIRECT:/admin");
    expect(inserts[0]).toMatchObject({ name: "Next Stop Łódź", slug: "next-stop-lodz", billing_email: "anna@firma.pl", owner_user_id: "u1" });
  });

  it("zajęty slug (także wyścig dwóch zapisów) → kolejne numery aż do wolnego", async () => {
    taken.add("next-stop");
    taken.add("next-stop-2");
    await expect(createOrganization(idle, fd("Next Stop"))).rejects.toThrow("REDIRECT:/admin");
    expect(inserts.map((r) => r.slug)).toEqual(["next-stop", "next-stop-2", "next-stop-3"]);
  });

  it("nielatynowa nazwa → wartość zastępcza „organizacja”", async () => {
    await expect(createOrganization(idle, fd("Ивент"))).rejects.toThrow("REDIRECT:/admin");
    expect(inserts[0].slug).toBe("organizacja");
  });

  it("inny błąd bazy → komunikat, bez ponawiania", async () => {
    state.failOther = true;
    expect(await createOrganization(idle, fd("Acme"))).toMatchObject({ status: "error" });
    expect(inserts).toHaveLength(1);
  });

  it("formularz nie przyjmuje już sluga z zewnątrz (pole usunięte)", async () => {
    const f = fd("Acme");
    f.set("slug", "cudzy-adres");
    await expect(createOrganization(idle, f)).rejects.toThrow("REDIRECT:/admin");
    expect(inserts[0].slug).toBe("acme");
  });

  it("konto ma już organizację (drugie wysłanie formularza) → /admin bez drugiego zapisu", async () => {
    state.existingOrg = true;
    await expect(createOrganization(idle, fd("Acme"))).rejects.toThrow("REDIRECT:/admin");
    expect(inserts).toHaveLength(0);
  });

  it("równoległy zapis odrzucony przez unikalność właściciela → /admin, bez kolejnych prób", async () => {
    state.ownerConflict = true;
    await expect(createOrganization(idle, fd("Acme"))).rejects.toThrow("REDIRECT:/admin");
    expect(inserts).toHaveLength(1);
  });

  it("dawny lub obecny partner może założyć organizację (bez przekierowania na /partner)", async () => {
    for (const status of ["revoked", "active", "expired"]) {
      partner.status = status;
      inserts.length = 0;
      taken.clear();
      await expect(createOrganization(idle, fd("Acme"))).rejects.toThrow("REDIRECT:/admin");
      expect(inserts).toHaveLength(1);
    }
  });
});
