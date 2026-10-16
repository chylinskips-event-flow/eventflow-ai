import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

// Bramka planu po stronie partnera: każda strona i akcja panelu (także wniosek o stoisko)
// przechodzi przez getPartnerContext → bez partner_portal w planie organizatora brak dostępu.
const db = createDbMock();
const plan = { partnerPortal: true };
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@firma.pl" } } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/entitlements", () => ({ hasFeature: async () => plan.partnerPortal }));

const PARTNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const { getPartnerContext } = await import("@/lib/partner-portal");

beforeEach(() => {
  db.reset();
  plan.partnerPortal = true;
  db.results["partner_access:select"] = () => ({
    data: {
      id: "acc1",
      events: { id: "ev1", organization_id: "org1", name: "Targi", slug: "targi", status: "published", timezone: null, starts_at: null, deleted_at: null },
    },
    error: null,
  });
  db.results["partners:select"] = () => ({ data: { id: PARTNER, name: "Firma A", event_id: "ev1" }, error: null });
});

describe("panel partnera — bramka planu", () => {
  it("plan z partner_portal → dostęp", async () => {
    expect(await getPartnerContext(PARTNER)).toMatchObject({ partner: { id: PARTNER }, event: { id: "ev1" } });
  });

  it("plan bez partner_portal → brak dostępu (strony i akcje, w tym wniosek o stoisko)", async () => {
    plan.partnerPortal = false;
    expect(await getPartnerContext(PARTNER)).toBeNull();
  });

  it("brak aktywnego dostępu do tego partnera → brak dostępu", async () => {
    db.results["partner_access:select"] = () => ({ data: null, error: null });
    expect(await getPartnerContext(PARTNER)).toBeNull();
  });
});
