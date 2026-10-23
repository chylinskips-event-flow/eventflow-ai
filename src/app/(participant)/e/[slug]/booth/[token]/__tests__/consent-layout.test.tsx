import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Zdanie zgody przy stoisku: nazwa partnera w tym samym akapicie co zdanie (etykieta jako blok,
// nie flex — inaczej tekst, <strong> i reszta zdania stają się osobnymi kolumnami/blokami).
// Treść zgody draft-2026-10 bez zmian.

vi.mock("../actions", () => ({ submitBoothVisit: async () => ({ status: "idle" }) }));
vi.mock("../../../partner-lead-actions", () => ({
  submitPartnerLead: async () => ({ status: "idle" }),
  withdrawPartnerConsent: async () => ({ status: "success" }),
}));

const { BoothClient } = await import("../booth-client");
const { PartnerLeadCard } = await import("../partner-lead-card");
const { leadConsentFor, PARTNER_LEADS_CONSENT } = await import("@/lib/partner-leads-core");

function labelFor(html: string, id: string) {
  const match = html.match(new RegExp(`<label[^>]*for="${id}"[^>]*>([\\s\\S]*?)</label>`));
  expect(match, `brak etykiety ${id}`).not.toBeNull();
  const open = match![0].slice(0, match![0].indexOf(">") + 1);
  return { classes: (open.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/), inner: match![1] };
}

describe("układ zdania zgody przy stoisku", () => {
  it("stara zgoda leadowa: etykieta blokowa, nazwa partnera w środku zdania", () => {
    const html = renderToStaticMarkup(
      <BoothClient
        slug="expo"
        partnerToken="tok"
        partner={{ id: "p1", name: "LHH Polska", logo_url: null, description: null, tier: null, booth_location: null }}
        quest={null}
        initialAttemptsUsed={0}
        legacyLeadConsent
      />,
    );
    const { classes, inner } = labelFor(html, "lead_consent");
    expect(classes).toContain("block");
    expect(classes).not.toContain("flex");
    expect(inner).toMatch(/partnerowi <strong>LHH Polska<\/strong> w celach/);
  });

  it("zgoda Fazy B: etykieta blokowa, treść draft-2026-10 dokładnie bez zmian", () => {
    const consent = leadConsentFor(true, "LHH Polska", "Next Stop Łódź");
    expect(consent.version).toBe("draft-2026-10");
    expect(PARTNER_LEADS_CONSENT.legalApproved).toBe(false);
    const html = renderToStaticMarkup(
      <PartnerLeadCard
        slug="expo"
        partnerToken="tok"
        partnerName="LHH Polska"
        questions={[{ id: "q1", prompt: "Czym się zajmujesz?", kind: "text", options: [] } as never]}
        consentText={consent.text}
        consentVersion={consent.version}
        activeConsentId={null}
      />,
    );
    const { classes, inner } = labelFor(html, "partner_consent");
    expect(classes).toContain("block");
    expect(classes).not.toContain("flex");
    // Jeden węzeł tekstu — bez osobnych bloków w środku zdania.
    expect(inner).not.toMatch(/</);
    expect(inner).toBe(
      consent.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    );
  });
});
