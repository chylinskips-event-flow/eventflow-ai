import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_LEADS_CONSENT } from "@/lib/partner-leads-core";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = {
  enabled: true,
  questions: [] as { id: string; kind: "text"; prompt: string; options: never[] }[],
  activeConsent: null as null | { id: string; given_at: string },
};
const inserts: { table: string; payload: Record<string, unknown> }[] = [];

vi.mock("@/lib/attendee-session", () => ({ getCurrentAttendee: async () => ({ id: "att1" }) }));
vi.mock("@/lib/partners", () => ({ getPartnerByTokenAndEventSlug: async () => ({ id: "p1", event_id: "ev1", name: "Acme" }) }));
vi.mock("@/lib/events", () => ({ getEventBySlugForRegistration: async () => ({ id: "ev1", name: "Expo" }) }));
vi.mock("@/lib/partner-leads", () => ({
  isPartnerLeadsEnabled: () => ctx.enabled,
  getPartnerQuestions: async () => ctx.questions,
  getActiveConsent: async () => ctx.activeConsent,
  logLeadAudit: async () => true,
  withdrawConsent: async () => null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        const res = { data: { id: "c-new" }, error: null };
        return { select: () => ({ single: async () => res }), then: (f: (v: unknown) => unknown) => f({ error: null }) };
      },
    }),
  }),
}));

const { submitPartnerLead } = await import("../partner-lead-actions");
const idle = { status: "idle" as const };
const form = (v: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, val] of Object.entries(v)) fd.set(k, val);
  return fd;
};

beforeEach(() => {
  inserts.length = 0;
  ctx.enabled = true;
  ctx.questions = [];
  ctx.activeConsent = null;
});

describe("submitPartnerLead", () => {
  it("bez pytań: sama zgoda na kontakt, wariant contactOnly", async () => {
    const res = await submitPartnerLead("expo", "tok", idle, form({ partner_consent: "on", consent_version: PARTNER_LEADS_CONSENT.contactOnly.version }));
    expect(res).toEqual({ status: "success", consentId: "c-new" });
    const consent = inserts.find((i) => i.table === "partner_lead_consents")!;
    expect(consent.payload.consent_version).toBe(PARTNER_LEADS_CONSENT.contactOnly.version);
    expect(String(consent.payload.consent_text)).not.toMatch(/odpowiedzi/);
    expect(inserts.some((i) => i.table === "partner_question_answers")).toBe(false);
  });

  it("wersja z formularza nie pasuje do bieżących pytań → nic nie zapisujemy", async () => {
    ctx.questions = [{ id: "q1", kind: "text", prompt: "Budżet?", options: [] }];
    const res = await submitPartnerLead("expo", "tok", idle, form({ partner_consent: "on", consent_version: PARTNER_LEADS_CONSENT.contactOnly.version }));
    expect(res.status).toBe("error");
    expect(inserts).toHaveLength(0);
  });

  it("z pytaniami: zgoda w wariancie withQuestions + odpowiedzi", async () => {
    ctx.questions = [{ id: "q1", kind: "text", prompt: "Budżet?", options: [] }];
    const res = await submitPartnerLead(
      "expo", "tok", idle,
      form({ partner_consent: "on", consent_version: PARTNER_LEADS_CONSENT.withQuestions.version, q_q1: "10 tys." }),
    );
    expect(res.status).toBe("success");
    expect(inserts.find((i) => i.table === "partner_lead_consents")!.payload.consent_version).toBe(PARTNER_LEADS_CONSENT.withQuestions.version);
    expect(inserts.some((i) => i.table === "partner_question_answers")).toBe(true);
  });

  it("bez zaznaczonej zgody → błąd, nic nie zapisujemy", async () => {
    const res = await submitPartnerLead("expo", "tok", idle, form({ consent_version: PARTNER_LEADS_CONSENT.contactOnly.version }));
    expect(res.status).toBe("error");
    expect(inserts).toHaveLength(0);
  });

  it("po wycofaniu (brak aktywnej zgody) można wyrazić zgodę ponownie — nowy wiersz", async () => {
    ctx.activeConsent = null;
    const res = await submitPartnerLead("expo", "tok", idle, form({ partner_consent: "on", consent_version: PARTNER_LEADS_CONSENT.contactOnly.version }));
    expect(res.status).toBe("success");
    expect(inserts.filter((i) => i.table === "partner_lead_consents")).toHaveLength(1);
  });

  it("aktywna zgoda już jest → bez duplikatu", async () => {
    ctx.activeConsent = { id: "c-old", given_at: "2026-10-15T10:00:00Z" };
    const res = await submitPartnerLead("expo", "tok", idle, form({ partner_consent: "on", consent_version: PARTNER_LEADS_CONSENT.contactOnly.version }));
    expect(res).toEqual({ status: "success", consentId: "c-old" });
    expect(inserts).toHaveLength(0);
  });
});
