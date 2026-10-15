import { describe, expect, it } from "vitest";
import {
  PARTNER_LEADS_CONSENT,
  csvSafe,
  leadsToCsvRows,
  partnerLeadsEnabled,
  validateAnswers,
  validateQuestionInput,
  type PartnerLead,
  type PublicQuestion,
} from "../partner-leads-core";

const getter = (o: Record<string, string>) => (k: string) => o[k];

describe("partnerLeadsEnabled — flaga i bramka prawna", () => {
  it("domyślnie wyłączona", () => {
    expect(partnerLeadsEnabled({})).toBe(false);
    expect(partnerLeadsEnabled({ PARTNER_LEADS_ENABLED: "false", VERCEL_ENV: "preview" })).toBe(false);
  });
  it("Preview / lokalnie: włącza sama flaga", () => {
    expect(partnerLeadsEnabled({ PARTNER_LEADS_ENABLED: "true", VERCEL_ENV: "preview" }, false)).toBe(true);
    expect(partnerLeadsEnabled({ PARTNER_LEADS_ENABLED: "true" }, false)).toBe(true);
  });
  it("produkcja: flaga NIE wystarcza bez akceptacji prawnej", () => {
    expect(partnerLeadsEnabled({ PARTNER_LEADS_ENABLED: "true", VERCEL_ENV: "production" }, false)).toBe(false);
    expect(partnerLeadsEnabled({ PARTNER_LEADS_ENABLED: "true", VERCEL_ENV: "production" }, true)).toBe(true);
  });
  it("treść zgody nie jest jeszcze zatwierdzona prawnie", () => {
    expect(PARTNER_LEADS_CONSENT.legalApproved).toBe(false);
    expect(PARTNER_LEADS_CONSENT.text("Acme", "Expo")).toContain("Acme");
  });
});

describe("validateQuestionInput", () => {
  it("pytanie otwarte", () => {
    expect(validateQuestionInput(getter({ kind: "text", prompt: "  Jaki budżet?  " }))).toEqual({
      ok: true,
      value: { kind: "text", prompt: "Jaki budżet?", options: [] },
    });
  });
  it("wybór: opcje z linii, id a/b/c", () => {
    const r = validateQuestionInput(getter({ kind: "single_choice", prompt: "Kiedy?", options: "Q1\n\n Q2 \nQ3" }));
    expect(r).toEqual({
      ok: true,
      value: { kind: "single_choice", prompt: "Kiedy?", options: [{ id: "a", label: "Q1" }, { id: "b", label: "Q2" }, { id: "c", label: "Q3" }] },
    });
  });
  it("błędy", () => {
    expect(validateQuestionInput(getter({ kind: "x", prompt: "a" })).ok).toBe(false);
    expect(validateQuestionInput(getter({ kind: "text", prompt: " " })).ok).toBe(false);
    expect(validateQuestionInput(getter({ kind: "single_choice", prompt: "a", options: "tylko jedna" })).ok).toBe(false);
    expect(validateQuestionInput(getter({ kind: "single_choice", prompt: "a", options: "Tak\ntak" })).ok).toBe(false);
  });
});

describe("validateAnswers", () => {
  const qs: PublicQuestion[] = [
    { id: "q1", kind: "text", prompt: "Budżet?", options: [] },
    { id: "q2", kind: "single_choice", prompt: "Kiedy?", options: [{ id: "a", label: "Teraz" }, { id: "b", label: "Później" }] },
  ];
  it("puste pomijane, wybór zapisany jako etykieta", () => {
    expect(validateAnswers(qs, getter({ q_q1: " ", q_q2: "b" }))).toEqual({
      ok: true,
      answers: [{ questionId: "q2", prompt: "Kiedy?", answer: "Później" }],
    });
  });
  it("opcja spoza listy → błąd", () => {
    expect(validateAnswers(qs, getter({ q_q2: "z" })).ok).toBe(false);
  });
  it("za długa odpowiedź → błąd", () => {
    expect(validateAnswers(qs, getter({ q_q1: "x".repeat(501) })).ok).toBe(false);
  });
});

describe("eksport CSV", () => {
  const lead = (answers: PartnerLead["answers"]): PartnerLead => ({
    consentId: "c",
    givenAt: "2026-10-15T10:00:00Z",
    consentVersion: "v",
    firstName: "Ala",
    lastName: null,
    email: "a@b.pl",
    company: null,
    jobTitle: null,
    answers,
  });
  it("kolumna na każde pytanie, brak odpowiedzi = pusta komórka", () => {
    const { columns, rows } = leadsToCsvRows([lead([{ prompt: "P1", answer: "x" }]), lead([{ prompt: "P2", answer: "y" }])]);
    expect(columns.slice(-2)).toEqual(["P1", "P2"]);
    expect(rows[0].P2).toBe("");
    expect(rows[1].P2).toBe("y");
  });
  it("csvSafe neutralizuje formuły", () => {
    expect(csvSafe("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvSafe("Acme")).toBe("Acme");
  });
});
