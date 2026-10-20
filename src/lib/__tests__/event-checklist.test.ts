import { describe, expect, it } from "vitest";
import { checklistStartsExpanded, computeChecklist, type ChecklistData } from "@/lib/event-checklist";

const fresh: ChecklistData = {
  eventId: "e1",
  status: "draft",
  startsAt: "2026-11-17T09:00:00Z",
  endsAt: "2026-11-17T17:00:00Z",
  location: null,
  logoUrl: null,
  primaryColor: null,
  registrationOpen: false,
  ticketTypes: 0,
  sessions: 0,
  speakers: 0,
  partners: 0,
  publicUrl: "https://eventro.pl/e/targi",
};

const done = (d: ChecklistData, key: string) => computeChecklist(d).steps.find((s) => s.key === key)!.done;

describe("checklista startowa — kroki", () => {
  it("Podstawy: daty i lokalizacja", () => {
    expect(done(fresh, "podstawy")).toBe(false);
    expect(done({ ...fresh, location: "  " }, "podstawy")).toBe(false);
    expect(done({ ...fresh, location: "Łódź, EXPO" }, "podstawy")).toBe(true);
    expect(done({ ...fresh, location: "Łódź", endsAt: null }, "podstawy")).toBe(false);
  });

  it("Wygląd strony: logo albo zmieniony kolor (czarny domyślny z pola koloru się nie liczy)", () => {
    expect(done(fresh, "wyglad")).toBe(false);
    expect(done({ ...fresh, primaryColor: "#000000" }, "wyglad")).toBe(false);
    expect(done({ ...fresh, primaryColor: "#4F46E5" }, "wyglad")).toBe(true);
    expect(done({ ...fresh, logoUrl: "https://x/logo.png" }, "wyglad")).toBe(true);
  });

  it("Bilety / rejestracja: typ biletu albo otwarta rejestracja", () => {
    expect(done(fresh, "bilety")).toBe(false);
    expect(done({ ...fresh, ticketTypes: 1 }, "bilety")).toBe(true);
    expect(done({ ...fresh, registrationOpen: true }, "bilety")).toBe(true);
  });

  it("Program: pozycja agendy albo prelegent", () => {
    expect(done(fresh, "program")).toBe(false);
    expect(done({ ...fresh, sessions: 1 }, "program")).toBe(true);
    expect(done({ ...fresh, speakers: 2 }, "program")).toBe(true);
  });

  it("Partnerzy: opcjonalny", () => {
    const step = computeChecklist({ ...fresh, partners: 0 }).steps.find((s) => s.key === "partnerzy")!;
    expect(step.optional).toBe(true);
    expect(step.done).toBe(false);
    expect(done({ ...fresh, partners: 1 }, "partnerzy")).toBe(true);
  });

  it("Opublikuj: status inny niż szkic + link do publicznej strony", () => {
    expect(done(fresh, "publikacja")).toBe(false);
    expect(computeChecklist(fresh).steps.find((s) => s.key === "publikacja")!.extraLink).toBeUndefined();
    const live = computeChecklist({ ...fresh, status: "published" }).steps.find((s) => s.key === "publikacja")!;
    expect(live.done).toBe(true);
    expect(live.extraLink).toEqual({ href: "https://eventro.pl/e/targi", label: "Zobacz stronę" });
  });

  it("linki prowadzą do istniejących ekranów (zakładki Ustawień, Bilety, Agenda, Partnerzy)", () => {
    expect(computeChecklist(fresh).steps.map((s) => s.href)).toEqual([
      "/admin/events/e1?tab=ogolne",
      "/admin/events/e1?tab=branding",
      "/admin/events/e1/tickets",
      "/admin/events/e1/sessions",
      "/admin/events/e1/partners",
      "/admin/events/e1?tab=ogolne",
    ]);
  });
});

describe("checklista startowa — postęp", () => {
  const all: ChecklistData = {
    ...fresh,
    location: "Łódź",
    logoUrl: "https://x/logo.png",
    ticketTypes: 1,
    sessions: 1,
    status: "published",
  };

  it("krok opcjonalny nie blokuje 100%", () => {
    const c = computeChecklist({ ...all, partners: 0 });
    expect(c).toMatchObject({ done: 5, total: 5, complete: true });
  });

  it("licznik tylko kroków wymaganych", () => {
    expect(computeChecklist(fresh)).toMatchObject({ done: 0, total: 5, complete: false });
    expect(computeChecklist({ ...fresh, partners: 3 })).toMatchObject({ done: 0, total: 5 });
  });

  it("domyślnie rozwinięta przy < 2 ukończonych krokach, potem zwinięta", () => {
    expect(checklistStartsExpanded(computeChecklist(fresh))).toBe(true);
    expect(checklistStartsExpanded(computeChecklist({ ...fresh, location: "Łódź" }))).toBe(true);
    expect(checklistStartsExpanded(computeChecklist({ ...fresh, location: "Łódź", sessions: 1 }))).toBe(false);
  });
});
