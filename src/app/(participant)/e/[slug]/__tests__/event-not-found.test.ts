import { describe, it, expect, vi } from "vitest";

// Nieistniejące wydarzenie: strona wywołuje notFound() (HTTP 404), a nie renderuje komunikatu z 200.

vi.mock("@/lib/events", () => ({
  getEventBySlugForRegistration: async () => null,
  getRegistrationUnavailableReason: () => null,
  isCurrentUserEventOwner: async () => false,
  DEFAULT_INTEREST_OPTIONS: [],
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "eventro.pl" }) }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const page = await import("../page");
const notFoundPage = await import("../not-found");

describe("nieistniejące wydarzenie", () => {
  it("strona wydarzenia wywołuje notFound()", async () => {
    await expect(
      page.default({
        params: Promise.resolve({ slug: "nie-ma-takiego" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("not-found segmentu ma polski komunikat", () => {
    expect(JSON.stringify(notFoundPage.default())).toContain("Wydarzenie nie zostało znalezione");
  });
});
