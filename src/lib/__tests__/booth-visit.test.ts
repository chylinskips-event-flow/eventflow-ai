import { describe, expect, it } from "vitest";
import { alreadyVisitedPointsLabel, partnersWithoutBoothQuest, visitResultView } from "@/lib/booth-visit";
import { PARTNER_LEADS_CONSENT, leadCardState } from "@/lib/partner-leads-core";

describe("komunikat po wizycie przy stoisku", () => {
  it("bez questa: „Wizyta zapisana”, bez punktów i bez „0 pkt”", () => {
    expect(visitResultView({ hasQuest: false, pointsAwarded: 0, levelUp: false })).toEqual({
      title: "Wizyta zapisana",
      points: null,
      showLevelUp: false,
    });
  });

  it("z questem i naliczonymi punktami: „Stoisko odwiedzone!” +X pkt", () => {
    expect(visitResultView({ hasQuest: true, pointsAwarded: 10, levelUp: true })).toEqual({
      title: "Stoisko odwiedzone!",
      points: 10,
      showLevelUp: true,
    });
  });

  it("z questem, ale bez naliczonych punktów (np. już zaliczony): bez „0 pkt”", () => {
    expect(visitResultView({ hasQuest: true, pointsAwarded: 0, levelUp: false }).points).toBeNull();
  });
});

describe("podpowiedź na stronie questów", () => {
  const partners = [
    { id: "p1", name: "Acme" },
    { id: "p2", name: "Beta" },
    { id: "p3", name: "Gamma" },
  ];

  it("partnerzy bez aktywnego questa stoiskowego", () => {
    const quests = [
      { partner_id: "p1", is_active: true },
      { partner_id: "p2", is_active: false },
      { partner_id: null, is_active: true },
    ];
    expect(partnersWithoutBoothQuest(partners, quests).map((p) => p.name)).toEqual(["Beta", "Gamma"]);
  });

  it("każdy partner ma quest → brak podpowiedzi", () => {
    const quests = partners.map((p) => ({ partner_id: p.id, is_active: true }));
    expect(partnersWithoutBoothQuest(partners, quests)).toEqual([]);
  });
});

describe("karta zgody przy stoisku — zawsze widoczna przy włączonej fladze", () => {
  const base = { partnerName: "Acme", eventName: "Expo", activeConsentId: null };
  const q = (status: string) => ({ id: `q-${status}`, kind: "text" as const, prompt: `P ${status}`, options: [], status });

  it("flaga wyłączona → brak karty", () => {
    expect(leadCardState({ ...base, enabled: false, questions: [] })).toBeNull();
  });

  it("brak pytań → sama zgoda na kontakt (formularz)", () => {
    const card = leadCardState({ ...base, enabled: true, questions: [] })!;
    expect(card.questions).toEqual([]);
    expect(card.consent.version).toBe(PARTNER_LEADS_CONSENT.contactOnly.version);
    expect(card.mode).toBe("form");
  });

  it("pytania tylko oczekujące / odrzucone → uczestnik ich nie widzi, karta ze zgodą jest", () => {
    const card = leadCardState({ ...base, enabled: true, questions: [q("pending"), q("rejected")] })!;
    expect(card.questions).toEqual([]);
    expect(card.consent.version).toBe(PARTNER_LEADS_CONSENT.contactOnly.version);
  });

  it("pytania zaakceptowane → pytania + zgoda w wariancie z pytaniami", () => {
    const card = leadCardState({ ...base, enabled: true, questions: [q("approved"), q("pending")] })!;
    expect(card.questions.map((x) => x.id)).toEqual(["q-approved"]);
    expect(card.consent.version).toBe(PARTNER_LEADS_CONSENT.withQuestions.version);
  });

  it("aktywna zgoda → podziękowanie; po wycofaniu karta wraca z pytaniami do odpowiedzi", () => {
    expect(leadCardState({ ...base, enabled: true, questions: [q("approved")], activeConsentId: "c1" })!.mode).toBe("given");
    const afterWithdraw = leadCardState({ ...base, enabled: true, questions: [q("approved")], activeConsentId: null })!;
    expect(afterWithdraw.mode).toBe("form");
    expect(afterWithdraw.questions).toHaveLength(1);
  });

  it("tekst zgody bez zmian (wersja draft-2026-10)", () => {
    const card = leadCardState({ ...base, enabled: true, questions: [] })!;
    expect(card.consent.text).toBe(PARTNER_LEADS_CONSENT.contactOnly.text("Acme", "Expo"));
    expect(card.consent.version).toMatch(/draft-2026-10/);
  });
});

describe("powtórna wizyta stoiska", () => {
  it("punkty z wcześniejszej wizyty bez plusa: „Punkty zaliczone: 20”", () => {
    expect(alreadyVisitedPointsLabel(20)).toBe("Punkty zaliczone: 20");
    expect(alreadyVisitedPointsLabel(20)).not.toMatch(/\+/);
  });
  it("brak punktów → bez linii z punktami", () => {
    expect(alreadyVisitedPointsLabel(0)).toBeNull();
    expect(alreadyVisitedPointsLabel(null)).toBeNull();
  });
});
