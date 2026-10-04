import { describe, it, expect } from "vitest";
import {
  alertInLinkScope,
  collectRooms,
  currentAndNext,
  formatCountdown,
  groupByTier,
  normalizeRoom,
  pickFocusSession,
  sessionInLinkScope,
  validateAlertContent,
  validateLinkLabel,
  validateNoteContent,
} from "../moderator-core";

const t = (h: number) => new Date(Date.UTC(2026, 9, 10, h)).toISOString();
const ms = (h: number) => Date.UTC(2026, 9, 10, h);

describe("zakres sali", () => {
  it("link bez sali widzi wszystkie sesje, link z salą — tylko swoją", () => {
    expect(sessionInLinkScope(null, "Sala A")).toBe(true);
    expect(sessionInLinkScope(null, null)).toBe(true);
    expect(sessionInLinkScope("Sala A", "Sala A")).toBe(true);
    expect(sessionInLinkScope("Sala A", " Sala A ")).toBe(true);
    expect(sessionInLinkScope("Sala A", "Sala B")).toBe(false);
    expect(sessionInLinkScope("Sala A", null)).toBe(false);
  });

  it("komunikat bez sali trafia do wszystkich", () => {
    expect(alertInLinkScope("Sala A", null)).toBe(true);
    expect(alertInLinkScope("Sala A", "Sala A")).toBe(true);
    expect(alertInLinkScope("Sala A", "Sala B")).toBe(false);
    expect(alertInLinkScope(null, "Sala B")).toBe(true);
  });

  it("sale: ustawienia + sesje, bez duplikatów i pustych", () => {
    expect(collectRooms(["Sala A", "Sala B"], ["Sala B", null, " ", "Sala C "])).toEqual(["Sala A", "Sala B", "Sala C"]);
    expect(normalizeRoom("  ")).toBeNull();
    expect(normalizeRoom(" Sala A ")).toBe("Sala A");
  });
});

describe("walidacja", () => {
  it("etykieta, komunikat, notatka", () => {
    expect(validateLinkLabel(" ")).toMatchObject({ ok: false });
    expect(validateLinkLabel("x".repeat(101))).toMatchObject({ ok: false });
    expect(validateLinkLabel(" Anna ")).toEqual({ ok: true, value: "Anna" });
    expect(validateAlertContent("")).toMatchObject({ ok: false });
    expect(validateAlertContent("x".repeat(501))).toMatchObject({ ok: false });
    expect(validateNoteContent("a\r\nb  \n")).toEqual({ ok: true, value: "a\nb" });
    expect(validateNoteContent("")).toEqual({ ok: true, value: "" });
    expect(validateNoteContent("x".repeat(10_001))).toMatchObject({ ok: false });
  });
});

describe("bieżąca i następna sesja", () => {
  const sessions = [
    { id: "a", starts_at: t(9), ends_at: t(10) },
    { id: "b", starts_at: t(10), ends_at: t(11) },
    { id: "c", starts_at: t(12), ends_at: t(13) },
    { id: "x", starts_at: null, ends_at: null },
  ];

  it("w trakcie sesji b: bieżąca b, następna c", () => {
    const r = currentAndNext(sessions, ms(10) + 30 * 60_000);
    expect(r.current?.id).toBe("b");
    expect(r.next?.id).toBe("c");
  });

  it("w przerwie: brak bieżącej", () => {
    const r = currentAndNext(sessions, ms(11) + 30 * 60_000);
    expect(r.current).toBeNull();
    expect(r.next?.id).toBe("c");
  });

  it("fokus: wybrana → bieżąca → następna → pierwsza", () => {
    expect(pickFocusSession(sessions, "c", ms(10))?.id).toBe("c");
    expect(pickFocusSession(sessions, "spoza-sali", ms(10) + 1)?.id).toBe("b");
    expect(pickFocusSession(sessions, null, ms(8))?.id).toBe("a");
    expect(pickFocusSession(sessions, null, ms(20))?.id).toBe("a");
    expect(pickFocusSession([], null, ms(20))).toBeNull();
  });

  it("odliczanie", () => {
    expect(formatCountdown(0)).toBe("teraz");
    expect(formatCountdown(4 * 60_000 + 1)).toBe("za 5 min");
    expect(formatCountdown(60 * 60_000)).toBe("za 1 h");
    expect(formatCountdown(80 * 60_000)).toBe("za 1 h 20 min");
  });
});

describe("partnerzy wg poziomu", () => {
  it("Gold → Silver → … → inne → bez poziomu, alfabetycznie w grupie", () => {
    const groups = groupByTier([
      { name: "Zeta", tier: null },
      { name: "Beta", tier: "gold" },
      { name: "Alfa", tier: "gold" },
      { name: "Medialny", tier: "media" },
      { name: "Gamma", tier: "silver" },
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["gold", "silver", "media", null]);
    expect(groups[0].items.map((p) => p.name)).toEqual(["Alfa", "Beta"]);
  });
});
