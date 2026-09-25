/**
 * Business Mixer — algorytm przydziału uczestników do stolików.
 * Czysty moduł TS bez zależności od DB — łatwy do testowania jednostkowego.
 *
 * Model kosztu (spec sekcja 3.3):
 *   met[i][j] = liczba rund ze wspólnym stolikiem (historia)
 *   Kara par:     PAIR_W * met[i][j]^2  (dla każdej unikalnej pary {i,j})
 *   Kara klastra: CLUSTER_W * (k-1)^2  gdy k ≥ 2 już-znanych przy stole (na osobę)
 */

// ── Stałe ──────────────────────────────────────────────────────────────────

const PAIR_W    = 10;    // A — kara par rośnie kwadratowo z powtórkami
const CLUSTER_W = 1000;  // C — silna kara za 2+ znajomych przy jednym stole
const RESTARTS  = 20;    // liczba restartów local-search per runda (≥2)

// ── PRNG (mulberry32, deterministyczny) ────────────────────────────────────

type RNG = () => number;

function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rng: RNG): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Rozmiary stolików ───────────────────────────────────────────────────────

/**
 * Zwraca tablicę rozmiarów stolików (długość = liczba używanych stolików ≤ tableCount).
 * `rem` stolików ma base+1 osób, pozostałe base.
 * null → nie wykonalne (N > tableCount * seatMax).
 */
function computeTableSizes(
  n: number,
  tableCount: number,
  seatMin: number,
  seatMax: number,
): number[] | null {
  if (n > tableCount * seatMax) return null;
  let t = tableCount;
  while (t > 0 && !(t * seatMin <= n && n <= t * seatMax)) t--;
  if (t === 0) return null;
  const base = Math.floor(n / t);
  const rem  = n - base * t;
  return Array.from({ length: t }, (_, i) => (i < rem ? base + 1 : base));
}

// ── Model kosztu ────────────────────────────────────────────────────────────

/** Koszt jednego stolika (indeksy osób) przy danej historii met. */
function tableCost(table: number[], met: number[][]): number {
  let cost = 0;
  const n = table.length;
  for (let a = 0; a < n; a++) {
    let known = 0;
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const m = met[table[a]][table[b]];
      if (b > a) cost += PAIR_W * m * m; // para liczona raz
      if (m >= 1) known++;
    }
    if (known >= 2) cost += CLUSTER_W * (known - 1) * (known - 1);
  }
  return cost;
}

function roundCost(tables: number[][], met: number[][]): number {
  return tables.reduce((s, t) => s + tableCost(t, met), 0);
}

/** Marginalny koszt dodania `id` do istniejącego stolika. */
function marginalCost(id: number, table: number[], met: number[][]): number {
  return tableCost([...table, id], met) - tableCost(table, met);
}

// ── Zachłanna konstrukcja ───────────────────────────────────────────────────

function greedyConstruct(order: number[], sizes: number[], met: number[][]): number[][] {
  const tables: number[][] = sizes.map(() => []);
  for (const id of order) {
    let bestT = -1;
    let bestC = Infinity;
    for (let t = 0; t < tables.length; t++) {
      if (tables[t].length >= sizes[t]) continue;
      const c = marginalCost(id, tables[t], met);
      if (bestT === -1 || c < bestC) { bestC = c; bestT = t; }
    }
    tables[bestT].push(id);
  }
  return tables;
}

// ── Hill-climbing (swapy par między stolikami) ──────────────────────────────

function hillClimb(tables: number[][], met: number[][]): number[][] {
  const t = tables.map((r) => [...r]);
  let improved = true;
  while (improved) {
    improved = false;
    outer: for (let ta = 0; ta < t.length; ta++) {
      for (let ia = 0; ia < t[ta].length; ia++) {
        for (let tb = ta + 1; tb < t.length; tb++) {
          for (let ib = 0; ib < t[tb].length; ib++) {
            const before = tableCost(t[ta], met) + tableCost(t[tb], met);
            [t[ta][ia], t[tb][ib]] = [t[tb][ib], t[ta][ia]];
            const after = tableCost(t[ta], met) + tableCost(t[tb], met);
            if (after < before) { improved = true; break outer; }
            [t[ta][ia], t[tb][ib]] = [t[tb][ib], t[ta][ia]]; // cofnij
          }
        }
      }
    }
  }
  return t;
}

// ── Perturbacja (ILS: iterated local search) ────────────────────────────────

function perturb(tables: number[][], rng: RNG, swaps = 6): number[][] {
  const t = tables.map((r) => [...r]);
  for (let i = 0; i < swaps; i++) {
    const ta = Math.floor(rng() * t.length);
    const tb = Math.floor(rng() * t.length);
    if (ta === tb || t[ta].length === 0 || t[tb].length === 0) continue;
    const ia = Math.floor(rng() * t[ta].length);
    const ib = Math.floor(rng() * t[tb].length);
    [t[ta][ia], t[tb][ib]] = [t[tb][ib], t[ta][ia]];
  }
  return t;
}

// ── Przydział jednej rundy z restartami ─────────────────────────────────────

function assignRound(N: number, sizes: number[], met: number[][], rng: RNG): number[][] {
  const ids = Array.from({ length: N }, (_, i) => i);
  let best: number[][] | null = null;
  let bestCost = Infinity;

  for (let r = 0; r < RESTARTS; r++) {
    // Co 3. restart: ILS (perturbacja najlepszego); pozostałe: świeży greedy
    let candidate: number[][];
    if (r % 3 !== 0 && best !== null) {
      candidate = perturb(best, rng);
    } else {
      candidate = greedyConstruct(seededShuffle(ids, rng), sizes, met);
    }
    candidate = hillClimb(candidate, met);
    const cost = roundCost(candidate, met);
    if (best === null || cost < bestCost) {
      bestCost = cost;
      best = candidate;
      if (cost === 0) break; // koszt 0 = brak powtórek i klastrów — idealne
    }
  }
  return best!;
}

// ── Aktualizacja macierzy historii ──────────────────────────────────────────

function updateMet(tables: number[][], met: number[][]): void {
  for (const table of tables) {
    for (let a = 0; a < table.length; a++) {
      for (let b = a + 1; b < table.length; b++) {
        met[table[a]][table[b]]++;
        met[table[b]][table[a]]++;
      }
    }
  }
}

// ── Publiczne typy i API ────────────────────────────────────────────────────

export type RoundAssignment = {
  roundNumber: number;
  tableNumber: number;
  participantIds: string[];
};

export type AssignInput = {
  participantIds: string[];
  rounds: number;
  tableCount: number;
  seatMin: number;
  seatMax: number;
  seed: number;
};

export type TableAssignment = {
  tableNumber: number;     // 1-indexed
  participantIds: string[];
};

export type QualityReport = {
  feasible: boolean;
  infeasibleReason?: string;
  /** Rozkład unikalnych spotkań (liczba różnych osób poznanych przez uczestnika). */
  uniqueMeetingsMin: number;
  uniqueMeetingsMed: number;
  uniqueMeetingsMax: number;
  /** Pary, które spotkały się ≥2 razy. */
  repeatedPairs: number;
  /** Liczba (osoba × runda) z k≥2 już-znanych przy stoliku — cel: 0. */
  clusterIncidents: number;
};

export type AssignResult = {
  rounds: TableAssignment[][];
  quality: QualityReport;
};

export function computeQuality(rounds: RoundAssignment[]): QualityReport {
  // Zbierz unikalne participantIds
  const pidSet = new Set<string>();
  for (const r of rounds) {
    for (const pid of r.participantIds) pidSet.add(pid);
  }
  const pids = [...pidSet];
  const N = pids.length;

  // Indeks pid → numer
  const pidToIdx = new Map<string, number>();
  pids.forEach((pid, i) => pidToIdx.set(pid, i));

  // Macierz historii
  const met: number[][] = Array.from({ length: N }, () => Array<number>(N).fill(0));

  // Grupuj rundy i sortuj
  const roundGroups = new Map<number, RoundAssignment[]>();
  for (const r of rounds) {
    if (!roundGroups.has(r.roundNumber)) roundGroups.set(r.roundNumber, []);
    roundGroups.get(r.roundNumber)!.push(r);
  }
  const sortedRoundNumbers = [...roundGroups.keys()].sort((a, b) => a - b);

  let totalClusterIncidents = 0;

  for (const rn of sortedRoundNumbers) {
    const tables = roundGroups.get(rn)!;

    // Incydenty klastrowe: liczymy PRZED aktualizacją met
    for (const table of tables) {
      const idxs = table.participantIds.map((pid) => pidToIdx.get(pid)!);
      for (const idx of idxs) {
        let known = 0;
        for (const other of idxs) {
          if (other !== idx && met[idx][other] >= 1) known++;
        }
        if (known >= 2) totalClusterIncidents++;
      }
    }

    // Zaktualizuj met
    for (const table of tables) {
      const idxs = table.participantIds.map((pid) => pidToIdx.get(pid)!);
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          met[idxs[a]][idxs[b]]++;
          met[idxs[b]][idxs[a]]++;
        }
      }
    }
  }

  // Powtórzone pary
  let repeatedPairs = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (met[i][j] >= 2) repeatedPairs++;
    }
  }

  // Unikalne spotkania per person
  const uniquePerPerson: number[] = Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i !== j && met[i][j] >= 1) uniquePerPerson[i]++;
    }
  }
  uniquePerPerson.sort((a, b) => a - b);

  return {
    feasible: true,
    uniqueMeetingsMin: uniquePerPerson[0]                     ?? 0,
    uniqueMeetingsMed: uniquePerPerson[Math.floor(N / 2)]     ?? 0,
    uniqueMeetingsMax: uniquePerPerson[N - 1]                 ?? 0,
    repeatedPairs,
    clusterIncidents: totalClusterIncidents,
  };
}

export function assign(input: AssignInput): AssignResult {
  const { participantIds, rounds, tableCount, seatMin, seatMax, seed } = input;
  const N = participantIds.length;

  const sizes = computeTableSizes(N, tableCount, seatMin, seatMax);
  if (!sizes) {
    return {
      rounds: [],
      quality: {
        feasible: false,
        infeasibleReason:
          `${N} uczestników nie mieści się w ${tableCount} stolikach po ${seatMin}–${seatMax} osób.`,
        uniqueMeetingsMin: 0,
        uniqueMeetingsMed: 0,
        uniqueMeetingsMax: 0,
        repeatedPairs: 0,
        clusterIncidents: 0,
      },
    };
  }

  const rng = mulberry32(seed);
  const ids = Array.from({ length: N }, (_, i) => i);
  const met: number[][] = Array.from({ length: N }, () => Array<number>(N).fill(0));

  const rawRounds: number[][][] = [];

  for (let r = 0; r < rounds; r++) {
    let tables: number[][];

    if (r === 0) {
      // Runda 1: losowy podział — zerowy koszt (brak historii)
      const shuffled = seededShuffle(ids, rng);
      let offset = 0;
      tables = sizes.map((size) => {
        const slice = shuffled.slice(offset, offset + size);
        offset += size;
        return slice;
      });
    } else {
      tables = assignRound(N, sizes, met, rng);
    }

    rawRounds.push(tables);
    updateMet(tables, met);
  }

  // Konwertuj rawRounds → RoundAssignment[] i przelicz jakość (DRY)
  const roundAssignments: RoundAssignment[] = rawRounds.flatMap((round, ri) =>
    round.map((table, ti) => ({
      roundNumber: ri + 1,
      tableNumber: ti + 1,
      participantIds: table.map((i) => participantIds[i]),
    })),
  );
  const quality = computeQuality(roundAssignments);

  // Mapuj indeksy → participantIds
  const result: TableAssignment[][] = rawRounds.map((round) =>
    round.map((table, ti) => ({
      tableNumber: ti + 1,
      participantIds: table.map((i) => participantIds[i]),
    })),
  );

  return { rounds: result, quality };
}

// ── assignRemaining — przelicza tylko rundy pending po rezygnacjach ─────────

export type AssignRemainingInput = {
  activeIds: string[];
  completedRounds: RoundAssignment[];   // done + active rounds — dla seeding met
  remainingRoundNumbers: number[];
  tableCount: number;
  seatMin: number;
  seatMax: number;
  seed: number;
};

export type AssignRemainingResult = {
  rounds: RoundAssignment[];
  actualTableCount: number;   // może być mniej niż tableCount po redukcji uczestników
  quality: QualityReport;     // dla pełnego planu (completedRounds + nowe rundy)
  infeasible?: string;
};

export function assignRemaining(input: AssignRemainingInput): AssignRemainingResult {
  const { activeIds, completedRounds, remainingRoundNumbers, tableCount, seatMin, seatMax, seed } = input;
  const N = activeIds.length;

  const sizes = computeTableSizes(N, tableCount, seatMin, seatMax);
  if (!sizes) {
    const reason = `Za mało aktywnych uczestników (${N}), by przeliczyć pozostałe rundy przy pojemności ${seatMin}–${seatMax} os./stół.`;
    return {
      rounds: [],
      actualTableCount: 0,
      quality: {
        feasible: false,
        infeasibleReason: reason,
        uniqueMeetingsMin: 0,
        uniqueMeetingsMed: 0,
        uniqueMeetingsMax: 0,
        repeatedPairs: 0,
        clusterIncidents: 0,
      },
      infeasible: reason,
    };
  }

  // Mapuj activeIds → indeksy 0..N-1
  const idxMap = new Map<string, number>();
  activeIds.forEach((id, i) => idxMap.set(id, i));

  // Zbuduj macierz met z completedRounds (tylko pary, gdzie obaj są aktywni)
  const met: number[][] = Array.from({ length: N }, () => Array<number>(N).fill(0));
  for (const ra of completedRounds) {
    const idxs = ra.participantIds
      .map((pid) => idxMap.get(pid))
      .filter((idx): idx is number => idx !== undefined);
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        met[idxs[a]][idxs[b]]++;
        met[idxs[b]][idxs[a]]++;
      }
    }
  }

  const rng = mulberry32(seed >>> 0);
  const sortedRoundNumbers = [...remainingRoundNumbers].sort((a, b) => a - b);
  const newRounds: RoundAssignment[] = [];

  for (const rn of sortedRoundNumbers) {
    const tables = assignRound(N, sizes, met, rng);
    updateMet(tables, met);
    tables.forEach((table, ti) => {
      newRounds.push({
        roundNumber: rn,
        tableNumber: ti + 1,
        participantIds: table.map((i) => activeIds[i]),
      });
    });
  }

  // Jakość dla pełnego planu (completedRounds + nowe rundy)
  const quality = computeQuality([...completedRounds, ...newRounds]);

  return {
    rounds: newRounds,
    actualTableCount: sizes.length,
    quality,
  };
}
