import { describe, it, expect } from "vitest";
import { assignIcebreakers, BANK, nextUnusedQuestion } from "../icebreakers";
import { assign } from "../assign";

const SEED = 42;

function makePids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

// ── Bank nie jest pusty ──────────────────────────────────────────────────────
describe("BANK", () => {
  it("zawiera ≥ 120 pytań", () => {
    expect(BANK.length).toBeGreaterThanOrEqual(120);
  });

  it("każde pytanie ma id, theme i text", () => {
    for (const q of BANK) {
      expect(typeof q.id).toBe("string");
      expect(typeof q.theme).toBe("string");
      expect(typeof q.text).toBe("string");
      expect(q.text.length).toBeGreaterThan(10);
    }
  });
});

// ── Benchmark 89/18/6 — brak powtórzeń pytań ─────────────────────────────────
describe("assignIcebreakers benchmark 89/18/6", () => {
  const assignResult = assign({
    participantIds: makePids(89),
    rounds:     6,
    tableCount: 18,
    seatMin:    4,
    seatMax:    5,
    seed:       SEED,
  });

  const icebreakers = assignIcebreakers(assignResult.rounds, SEED);

  // 6 rund × 18 stolików (1 z 4 os, 17 z 5 os) = 108 slotów ≤ bank 120 ✓
  it("liczba przydziałów = rounds × tablesPerRound", () => {
    const totalSlots = assignResult.rounds.reduce(
      (sum, round) => sum + round.length,
      0,
    );
    expect(icebreakers).toHaveLength(totalSlots);
  });

  it("brak powtórzonych pytań (108 unikalnych z banku 120)", () => {
    const texts = icebreakers.map((ib) => ib.question);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("każdy slot ma roundNumber i tableNumber", () => {
    for (const ib of icebreakers) {
      expect(ib.roundNumber).toBeGreaterThanOrEqual(1);
      expect(ib.tableNumber).toBeGreaterThanOrEqual(1);
      expect(typeof ib.question).toBe("string");
      expect(ib.question.length).toBeGreaterThan(5);
    }
  });
});

// ── Determinizm ─────────────────────────────────────────────────────────────
describe("determinism", () => {
  it("to samo ziarno → identyczne ice-breakery", () => {
    const aResult = assign({
      participantIds: makePids(12),
      rounds: 3, tableCount: 3, seatMin: 4, seatMax: 4, seed: 7,
    });
    const ib1 = assignIcebreakers(aResult.rounds, 7);
    const ib2 = assignIcebreakers(aResult.rounds, 7);
    expect(JSON.stringify(ib1)).toBe(JSON.stringify(ib2));
  });

  it("różne ziarna → różne ice-breakery", () => {
    const aResult = assign({
      participantIds: makePids(12),
      rounds: 3, tableCount: 3, seatMin: 4, seatMax: 4, seed: 1,
    });
    const ib1 = assignIcebreakers(aResult.rounds, 1);
    const ib2 = assignIcebreakers(aResult.rounds, 2);
    expect(JSON.stringify(ib1)).not.toBe(JSON.stringify(ib2));
  });
});

// ── nextUnusedQuestion ───────────────────────────────────────────────────────
describe("nextUnusedQuestion", () => {
  it("zwraca pytanie spoza zbioru użytych", () => {
    const used = new Set(BANK.slice(0, 5).map((q) => q.text));
    const next = nextUnusedQuestion(used);
    expect(next).toBeTruthy();
    expect(used.has(next!)).toBe(false);
  });

  it("zwraca null gdy wszystkie pytania użyte", () => {
    const allTexts = new Set(BANK.map((q) => q.text));
    expect(nextUnusedQuestion(allTexts)).toBeNull();
  });
});
