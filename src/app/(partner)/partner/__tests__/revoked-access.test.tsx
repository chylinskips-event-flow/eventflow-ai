import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Partner z aktywną sesją po unieważnieniu dostępu: zamiast onboardingu organizatora
// („Skonfiguruj swoją organizację”) — ekran „Dostęp cofnięty” z „Wyloguj”.

const ctx = { status: "revoked" as "active" | "revoked" | "expired" | "none", memberships: [] as unknown[] };
const user = { id: "u1", email: "lhh@example.com" };

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/partner-portal", () => ({
  getAuthUser: async () => user,
  claimPendingInvites: async () => {},
  getMyPartnerMemberships: async () => ctx.memberships,
  getPartnerAccountStatus: async () => ctx.status,
}));
vi.mock("@/lib/organizations", () => ({ getOwnOrganization: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
vi.mock("@/components/logo", () => ({ Logo: () => null }));
vi.mock("../actions", () => ({ signOutPartner: async () => {} }));
vi.mock("../../../(organizer)/onboarding/form", () => ({
  OnboardingForm: () => <p>Skonfiguruj swoją organizację</p>,
}));

const { default: OnboardingPage } = await import("../../../(organizer)/onboarding/page");
const { default: PartnerHomePage } = await import("../page");

async function redirectOf(fn: () => Promise<unknown>) {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as { url?: string }).url ?? null;
  }
}

beforeEach(() => {
  ctx.status = "revoked";
  ctx.memberships = [];
});

describe("partner z cofniętym dostępem", () => {
  it("/onboarding (np. z /admin przez middleware) nie pokazuje onboardingu — przekierowuje na /partner", async () => {
    expect(await redirectOf(() => OnboardingPage())).toBe("/partner");
  });

  it("/partner pokazuje „Dostęp cofnięty” i „Wyloguj”, bez onboardingu", async () => {
    const html = renderToStaticMarkup(await PartnerHomePage());
    expect(html).toContain("Dostęp do panelu partnera został cofnięty");
    expect(html).toContain("Skontaktuj się z organizatorem");
    expect(html).toContain("Wyloguj");
    expect(html).not.toContain("Skonfiguruj swoją organizację");
  });

  it("konto bez żadnego dostępu partnera nadal trafia na onboarding organizatora", async () => {
    ctx.status = "none";
    const html = renderToStaticMarkup(await OnboardingPage());
    expect(html).toContain("Skonfiguruj swoją organizację");
  });
});
