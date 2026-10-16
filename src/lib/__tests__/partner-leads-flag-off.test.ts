import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMock } from "@/lib/__tests__/helpers/db-mock";

// „Flaga wyłączona = zachowanie jak dziś”: prawdziwe isPartnerLeadsEnabled (zmienne środowiska),
// zamockowana tylko baza i autoryzacja. Produkcja bez PARTNER_LEADS_ENABLED, a także produkcja
// z flagą, ale z zamkniętą bramką prawną (legalApproved: false) — żadnych zapisów leadowych,
// żadnego przekazania danych partnerowi, brak eksportu CSV leadów.

const db = createDbMock();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/partner-portal", () => ({
  getPartnerContext: async () => ({
    user: { id: "u1", email: "a@firma.pl" },
    accessId: "acc1",
    partner: { id: "p1", name: "Acme" },
    event: { id: "ev1", organization_id: "org1", name: "Expo", timezone: null },
  }),
}));
vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => ({ id: "att1" }) }));
vi.mock("@/lib/partners", () => ({ getPartnerByTokenAndEventSlug: async () => ({ id: "p1", event_id: "ev1", name: "Acme" }) }));
vi.mock("@/lib/events", () => ({
  getEventBySlugForRegistration: async () => ({ id: "ev1", name: "Expo" }),
  getOwnEvent: async () => ({ id: "ev1", organization_id: "org1", name: "Expo" }),
}));
vi.mock("@/lib/entitlements", () => ({ featureGate: async () => ({ ok: true }), hasFeature: async () => true }));

const { PARTNER_LEADS_CONSENT } = await import("@/lib/partner-leads-core");
const { isPartnerLeadsEnabled } = await import("@/lib/partner-leads");
const leadsActions = await import("@/app/(partner)/partner/[partnerId]/leads-actions");
const { GET: leadsCsv } = await import("@/app/(partner)/partner/[partnerId]/leads.csv/route");
const { submitPartnerLead } = await import("@/app/(participant)/e/[slug]/partner-lead-actions");
const { reviewPartnerQuestion } = await import("@/app/(organizer)/admin/events/[eventId]/partners/[partnerId]/actions");

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Q = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle" as const };
const fd = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};

const ENV_CASES = [
  ["produkcja bez PARTNER_LEADS_ENABLED (dzisiejsza konfiguracja)", { VERCEL_ENV: "production" }],
  ["produkcja z flagą, ale bramka prawna zamknięta", { VERCEL_ENV: "production", PARTNER_LEADS_ENABLED: "true" }],
  ["brak flagi (lokalnie / Preview bez zmiennej)", {}],
] as const;

const saved = { flag: process.env.PARTNER_LEADS_ENABLED, env: process.env.VERCEL_ENV };
afterEach(() => {
  process.env.PARTNER_LEADS_ENABLED = saved.flag;
  process.env.VERCEL_ENV = saved.env;
  if (saved.flag === undefined) delete process.env.PARTNER_LEADS_ENABLED;
  if (saved.env === undefined) delete process.env.VERCEL_ENV;
});

describe.each(ENV_CASES)("Faza B wyłączona — %s", (_label, env) => {
  beforeEach(() => {
    db.reset();
    delete process.env.PARTNER_LEADS_ENABLED;
    delete process.env.VERCEL_ENV;
    Object.assign(process.env, env);
  });

  it("bramka prawna nadal zamknięta w kodzie (legalApproved: false)", () => {
    expect(PARTNER_LEADS_CONSENT.legalApproved).toBe(false);
    expect(isPartnerLeadsEnabled()).toBe(false);
  });

  it("partner: pytania przy stoisku i podgląd leadów niedostępne, bez zapisów", async () => {
    const fields = fd({ prompt: "Budżet?", kind: "text" });
    for (const res of [
      await leadsActions.addPartnerQuestion(P, idle, fields),
      await leadsActions.resubmitPartnerQuestion(P, Q, idle, fields),
      await leadsActions.deletePartnerQuestion(P, Q),
      await leadsActions.loadPartnerLeads(P),
    ]) {
      expect(res).toMatchObject({ status: "error", message: "Ta funkcja jest niedostępna." });
    }
    expect(db.calls).toEqual([]);
  });

  it("partner: eksport CSV leadów → 404, bez wpisu w audycie", async () => {
    const res = await leadsCsv(new Request("https://test/x"), { params: Promise.resolve({ partnerId: P }) });
    expect(res.status).toBe(404);
    expect(db.calls).toEqual([]);
  });

  it("uczestnik: zgoda leadowa i odpowiedzi nie są zapisywane", async () => {
    const res = await submitPartnerLead(
      "expo",
      "tok",
      idle,
      fd({ partner_consent: "on", consent_version: PARTNER_LEADS_CONSENT.contactOnly.version }),
    );
    expect(res).toMatchObject({ status: "error" });
    expect(db.writes()).toEqual([]);
  });

  it("organizator: akceptacja pytań niedostępna", async () => {
    const res = await reviewPartnerQuestion("ev1", P, Q, "approved");
    expect(res).toMatchObject({ status: "error", message: "Ta funkcja jest niedostępna." });
    expect(db.writes()).toEqual([]);
  });
});
