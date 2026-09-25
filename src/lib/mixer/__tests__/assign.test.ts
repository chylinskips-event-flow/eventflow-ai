import { describe, it, expect } from "vitest";
import { assign, computeQuality, assignRemaining } from "../assign";
import type { RoundAssignment } from "../assign";

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

// ── computeQuality parytet ────────────────────────────────────────────────────
describe("computeQuality parity", () => {
  it("computeQuality(assign().rounds) === assign().quality", () => {
    const input = { participantIds: makePids(12), rounds: 4, tableCount: 3, seatMin: 4, seatMax: 4, seed: 99 };
    const result = assign(input);
    const ras: RoundAssignment[] = result.rounds.flatMap((round, ri) =>
      round.map((table) => ({
        roundNumber: ri + 1,
        tableNumber: table.tableNumber,
        participantIds: table.participantIds,
      }))
    );
    expect(computeQuality(ras)).toEqual(result.quality);
  });
});

// ── computeQuality swap delta ──────────────────────────────────────────────────
// Fixture: 8 osób, 4 stoliki po 2 osoby, 2 rundy.
// Runda 1 tworzy 4 pary (T1={p1,p2}, T2={p3,p4}, T3={p5,p6}, T4={p7,p8}).
// Runda 2 BEFORE: T1={p1,p2} → p1-p2 spotykają się po raz drugi (1 repeatedPair),
//   pozostałe stoliki mają ludzi z różnych par R1 → brak powtórek.
// Zamiana p2(T1)↔p3(T2): T1={p1,p3}, T2={p2,p5} — oba łączą ludzi z różnych par R1
//   → 0 repeatedPairs.
describe("computeQuality swap delta", () => {
  // Runda 1 — 4 pary
  const T1_R1: RoundAssignment = { roundNumber: 1, tableNumber: 1, participantIds: ["p1","p2"] };
  const T2_R1: RoundAssignment = { roundNumber: 1, tableNumber: 2, participantIds: ["p3","p4"] };
  const T3_R1: RoundAssignment = { roundNumber: 1, tableNumber: 3, participantIds: ["p5","p6"] };
  const T4_R1: RoundAssignment = { roundNumber: 1, tableNumber: 4, participantIds: ["p7","p8"] };

  // Runda 2 BEFORE — p1-p2 razem znowu → repeatedPair; reszta nowe
  const T1_R2_BEFORE: RoundAssignment = { roundNumber: 2, tableNumber: 1, participantIds: ["p1","p2"] };
  const T2_R2_BEFORE: RoundAssignment = { roundNumber: 2, tableNumber: 2, participantIds: ["p3","p5"] };
  const T3_R2_BEFORE: RoundAssignment = { roundNumber: 2, tableNumber: 3, participantIds: ["p4","p7"] };
  const T4_R2_BEFORE: RoundAssignment = { roundNumber: 2, tableNumber: 4, participantIds: ["p6","p8"] };

  // Runda 2 AFTER — zamiana p2(T1)↔p3(T2): T1={p1,p3}, T2={p2,p5}
  const T1_R2_AFTER: RoundAssignment = { roundNumber: 2, tableNumber: 1, participantIds: ["p1","p3"] };
  const T2_R2_AFTER: RoundAssignment = { roundNumber: 2, tableNumber: 2, participantIds: ["p2","p5"] };
  // T3 i T4 bez zmian

  const ALL_R1 = [T1_R1, T2_R1, T3_R1, T4_R1];
  const BEFORE = [...ALL_R1, T1_R2_BEFORE, T2_R2_BEFORE, T3_R2_BEFORE, T4_R2_BEFORE];
  const AFTER  = [...ALL_R1, T1_R2_AFTER,  T2_R2_AFTER,  T3_R2_BEFORE, T4_R2_BEFORE];

  it("before swap: repeatedPairs = 1 (p1-p2)", () => {
    const q = computeQuality(BEFORE);
    expect(q.repeatedPairs).toBe(1);
  });

  it("after swap (p2↔p3 in round 2): repeatedPairs = 0", () => {
    const q = computeQuality(AFTER);
    expect(q.repeatedPairs).toBe(0);
  });

  it("delta: after.repeatedPairs - before.repeatedPairs = -1", () => {
    const before = computeQuality(BEFORE);
    const after  = computeQuality(AFTER);
    expect(after.repeatedPairs - before.repeatedPairs).toBe(-1);
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

// ── assignRemaining ──────────────────────────────────────────────────────────
describe("assignRemaining", () => {
  // ── 1. Odpadły uczestnik nie pojawia się w przeliczonych rundach ──────────
  it("dropped participant absent from all pending rounds", () => {
    const N = 12;
    const allPids = makePids(N);
    const droppedPid = allPids[0];
    const activeIds = allPids.slice(1); // N-1 = 11 aktywnych

    const result = assignRemaining({
      activeIds,
      completedRounds: [],
      remainingRoundNumbers: [1, 2, 3],
      tableCount: 3,
      seatMin: 3,
      seatMax: 4,
      seed: SEED,
    });

    expect(result.infeasible).toBeUndefined();
    for (const ra of result.rounds) {
      expect(ra.participantIds).not.toContain(droppedPid);
    }
  });

  // ── 2. completedRounds nie jest mutowany ──────────────────────────────────
  it("completedRounds input array is not mutated", () => {
    const pids = makePids(8);
    const completedRounds: RoundAssignment[] = [
      { roundNumber: 1, tableNumber: 1, participantIds: [pids[0], pids[1], pids[2], pids[3]] },
      { roundNumber: 1, tableNumber: 2, participantIds: [pids[4], pids[5], pids[6], pids[7]] },
    ];
    const before = JSON.stringify(completedRounds);

    assignRemaining({
      activeIds: pids,
      completedRounds,
      remainingRoundNumbers: [2, 3],
      tableCount: 2,
      seatMin: 4,
      seatMax: 4,
      seed: SEED,
    });

    expect(JSON.stringify(completedRounds)).toBe(before);
  });

  // ── 3. Determinizm ────────────────────────────────────────────────────────
  it("determinism: two calls with identical input produce identical output", () => {
    const input = {
      activeIds: makePids(10),
      completedRounds: [] as RoundAssignment[],
      remainingRoundNumbers: [2, 3],
      tableCount: 2,
      seatMin: 4,
      seatMax: 5,
      seed: 999,
    };
    const r1 = assignRemaining(input);
    const r2 = assignRemaining(input);
    expect(JSON.stringify(r1.rounds)).toBe(JSON.stringify(r2.rounds));
  });

  // ── 4. Redukcja liczby stolików ───────────────────────────────────────────
  it("reduces actualTableCount when N is too small for original tableCount", () => {
    // 10 uczestników, 5 stolików × min 2 osoby = 10 — dokładnie. Drop 3 → 7.
    // 5 × 2 = 10 > 7, więc nie mieszczą się w 5 stolikach. Musi zmniejszyć do 3 lub 4.
    const activeIds = makePids(7);
    const result = assignRemaining({
      activeIds,
      completedRounds: [],
      remainingRoundNumbers: [2],
      tableCount: 5,
      seatMin: 2,
      seatMax: 3,
      seed: SEED,
    });

    expect(result.infeasible).toBeUndefined();
    expect(result.actualTableCount).toBeLessThan(5);
  });

  // ── 5. Infeasible: za mało uczestników nawet dla 1 stołu ─────────────────
  it("returns infeasible when N < seatMin", () => {
    const result = assignRemaining({
      activeIds: makePids(3),
      completedRounds: [],
      remainingRoundNumbers: [1],
      tableCount: 2,
      seatMin: 4,
      seatMax: 6,
      seed: SEED,
    });

    expect(result.infeasible).toBeTruthy();
    expect(result.rounds).toHaveLength(0);
    expect(result.quality.feasible).toBe(false);
  });

  // ── 6. Quality obejmuje pełny plan (completedRounds + nowe rundy) ─────────
  it("quality is computed over completedRounds + newRounds, not just newRounds", () => {
    const pids = makePids(8);
    // Runda 1 ukończona: każda para spotkała się raz w konkretnych grupach
    const completedRounds: RoundAssignment[] = [
      { roundNumber: 1, tableNumber: 1, participantIds: [pids[0], pids[1], pids[2], pids[3]] },
      { roundNumber: 1, tableNumber: 2, participantIds: [pids[4], pids[5], pids[6], pids[7]] },
    ];

    const result = assignRemaining({
      activeIds: pids,
      completedRounds,
      remainingRoundNumbers: [2],
      tableCount: 2,
      seatMin: 4,
      seatMax: 4,
      seed: SEED,
    });

    expect(result.infeasible).toBeUndefined();

    // Quality wyniku obejmuje WSZYSTKIE rundy — uniqueMeetingsMin >= 3 (R1 + R2)
    // vs quality tylko dla nowych rund = min 3 nowych znajomości
    const qualityNewOnly = computeQuality(result.rounds);
    // Dla pełnego planu: min spotkań = spotk. z R1 + R2 = 3 + 3 = 6
    // Dla nowych rund tylko: min = 3
    // Sprawdzamy, że quality wynik != quality samych nowych rund
    expect(result.quality.uniqueMeetingsMin).toBeGreaterThan(qualityNewOnly.uniqueMeetingsMin);
  });

  // ── 7. Guardy server action (TODO — trudne do testowania jednostkowego) ───
  // TODO: recomputeRemaining rejected in 'finished' state
  //   → action checks mixer.status ∉ ['running','generated'] and returns error
  // TODO: dropParticipant NOT blocked by checkEditable in 'running'
  //   → action bypasses checkEditable deliberately (comment in code)
});

