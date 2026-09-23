import { describe, it, expect } from "vitest";
import { assign } from "../assign";

const SEED = 42;

function makePids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

// ── Benchmark 89 uczestników / 18 stolików / 6 rund / 4–5 osób ───────────────
describe("assign benchmark 89/18/6", () => {
  const N        = 89;
  const TABLES   = 18;
  const ROUNDS   = 6;
  const SEAT_MIN = 4;
  const SEAT_MAX = 5;

  const result = assign({
    participantIds: makePids(N),
    rounds:      ROUNDS,
    tableCount:  TABLES,
    seatMin:     SEAT_MIN,
    seatMax:     SEAT_MAX,
    seed:        SEED,
  });

  it("feasible", () => {
    expect(result.quality.feasible).toBe(true);
  });

  it("correct number of rounds", () => {
    expect(result.rounds).toHaveLength(ROUNDS);
  });

  it("every round has exactly N participants (no duplicates, no missing)", () => {
    for (const [ri, round] of result.rounds.entries()) {
      const all = round.flatMap((t) => t.participantIds);
      expect(all).toHaveLength(N);
      expect(new Set(all).size).toBe(N);
    }
  });

  it("every table size is within [seatMin, seatMax]", () => {
    for (const round of result.rounds) {
      for (const table of round) {
        expect(table.participantIds.length).toBeGreaterThanOrEqual(SEAT_MIN);
        expect(table.participantIds.length).toBeLessThanOrEqual(SEAT_MAX);
      }
    }
  });

  it("table sizes are 17×5 + 1×4 (consistent across rounds)", () => {
    for (const round of result.rounds) {
      const sizes = round.map((t) => t.participantIds.length).sort((a, b) => a - b);
      const fours = sizes.filter((s) => s === 4).length;
      const fives = sizes.filter((s) => s === 5).length;
      expect(fours).toBe(1);
      expect(fives).toBe(17);
    }
  });

  it("each participant appears exactly once per round", () => {
    for (const round of result.rounds) {
      const seen = new Set<string>();
      for (const table of round) {
        for (const pid of table.participantIds) {
          expect(seen.has(pid)).toBe(false);
          seen.add(pid);
        }
      }
    }
  });

  // ── Cel jakościowy (wymagany spec sekcja 9) ──────────────────────────────
  it("clusterIncidents === 0 (brak 2+ znajomych przy stole)", () => {
    expect(result.quality.clusterIncidents).toBe(0);
  });

  it("repeatedPairs bliskie zeru (cel ≤ 5 dla 89/18/6)", () => {
    expect(result.quality.repeatedPairs).toBeLessThanOrEqual(5);
  });

  it("rozkład unikalnych spotkań: mediana ≥ 20", () => {
    expect(result.quality.uniqueMeetingsMed).toBeGreaterThanOrEqual(20);
  });

  it("rozkład unikalnych spotkań: min ≥ 15", () => {
    expect(result.quality.uniqueMeetingsMin).toBeGreaterThanOrEqual(15);
  });
});

// ── Determinizm ──────────────────────────────────────────────────────────────
describe("determinism", () => {
  it("to samo ziarno → identyczny plan", () => {
    const input = {
      participantIds: makePids(20),
      rounds:     3,
      tableCount: 4,
      seatMin:    4,
      seatMax:    6,
      seed:       12345,
    };
    const r1 = assign(input);
    const r2 = assign(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("różne ziarna → różne plany", () => {
    const base = {
      participantIds: makePids(20),
      rounds:     3,
      tableCount: 4,
      seatMin:    4,
      seatMax:    6,
    };
    const r1 = assign({ ...base, seed: 1 });
    const r2 = assign({ ...base, seed: 2 });
    expect(JSON.stringify(r1.rounds)).not.toBe(JSON.stringify(r2.rounds));
  });
});

// ── Niewykonalność (N > tableCount * seatMax) ────────────────────────────────
describe("infeasible", () => {
  it("zwraca feasible=false gdy za mało stolików", () => {
    const r = assign({
      participantIds: makePids(50),
      rounds:     3,
      tableCount: 5,
      seatMin:    4,
      seatMax:    6,
      seed:       1,
    });
    expect(r.quality.feasible).toBe(false);
    expect(r.quality.infeasibleReason).toBeTruthy();
    expect(r.rounds).toHaveLength(0);
  });
});

// ── Mały przypadek: 12 osób / 3 stoliki / 4 osoby ───────────────────────────
describe("small case 12/3/4", () => {
  const result = assign({
    participantIds: makePids(12),
    rounds:     4,
    tableCount: 3,
    seatMin:    4,
    seatMax:    4,
    seed:       99,
  });

  it("feasible", () => expect(result.quality.feasible).toBe(true));

  it("każdy stolik ma dokładnie 4 osoby", () => {
    for (const round of result.rounds) {
      for (const table of round) {
        expect(table.participantIds).toHaveLength(4);
      }
    }
  });
});
