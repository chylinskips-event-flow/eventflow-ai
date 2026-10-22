import { describe, it, expect, vi } from "vitest";

// Szkic: metadane strony wydarzenia i rejestracji nie zdradzają nazwy, opisu ani obrazka; noindex.

const ctx = { status: "draft" };
const EVENT = {
  id: "ev1",
  slug: "tajny",
  name: "Tajna Konferencja",
  status: "draft",
  banner_url: "https://cdn.example/tajny-baner.png",
  logo_url: null,
  starts_at: "2026-12-01T10:00:00Z",
  timezone: "Europe/Warsaw",
};

vi.mock("@/lib/events", () => ({
  getEventBySlugForRegistration: async () => ({ ...EVENT, status: ctx.status }),
  getRegistrationUnavailableReason: () => null,
  isCurrentUserEventOwner: async () => false,
  DEFAULT_INTEREST_OPTIONS: [],
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: { body: "Opis tajnej konferencji" }, error: null }),
    };
    return { from: () => b };
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "eventro.pl" }) }));

const page = await import("../page");
const registerPage = await import("../register/page");
const params = Promise.resolve({ slug: "tajny" });

describe("metadane szkicu", () => {
  it("/e/{slug}: brak nazwy, opisu i obrazka; noindex", async () => {
    ctx.status = "draft";
    const meta = await page.generateMetadata({ params });
    const json = JSON.stringify(meta);
    expect(json).not.toContain("Tajna");
    expect(json).not.toContain("tajny-baner");
    expect(json).not.toContain("Opis tajnej");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("/e/{slug}/register: brak nazwy; noindex", async () => {
    ctx.status = "draft";
    const meta = await registerPage.generateMetadata({ params });
    expect(JSON.stringify(meta)).not.toContain("Tajna");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it.each(["published", "live"])("wydarzenie %s: pełne metadane, bez noindex", async (status) => {
    ctx.status = status;
    const meta = await page.generateMetadata({ params });
    expect(meta.title).toBe("Tajna Konferencja");
    expect(JSON.stringify(meta.openGraph)).toContain("tajny-baner");
    expect(meta.robots).toBeUndefined();
    const reg = await registerPage.generateMetadata({ params });
    expect(reg.robots).toBeUndefined();
  });
});
