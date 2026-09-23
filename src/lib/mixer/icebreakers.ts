/**
 * Ice-breakery — przydział pytań z banku do stolików bez powtórzeń w obrębie eventu.
 * Bank ładowany statycznie z build-time JSON (nie jest publicznie serwowany).
 */

import bankData from "./icebreakers-bank.json";
import type { TableAssignment } from "./assign";

type BankQuestion = { id: string; theme: string; text: string };
export const BANK: BankQuestion[] = (
  bankData as { questions: BankQuestion[] }
).questions;

// Deterministyczny PRNG (ten sam mulberry32 co assign.ts — bez import cyklicznego)
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type IcebreakerAssignment = {
  roundNumber: number;
  tableNumber: number;
  question: string;
};

/**
 * Przydziela pytania ice-breaker do wszystkich slotów (runda × stolik).
 * Tasuje bank z podanego ziarna → to samo ziarno co assign() → powtarzalność.
 * Gdy slotów więcej niż pytań → cykluje z ostrzeżeniem w logach.
 */
export function assignIcebreakers(
  rounds: TableAssignment[][],
  seed: number,
): IcebreakerAssignment[] {
  const rng = mulberry32(seed);
  const shuffled = shuffleArray(BANK, rng);
  const result: IcebreakerAssignment[] = [];
  let idx = 0;
  let warnedOverflow = false;

  for (let r = 0; r < rounds.length; r++) {
    for (const table of rounds[r]) {
      if (idx >= shuffled.length) {
        if (!warnedOverflow) {
          console.warn(
            "[mixer] Bank ice-breakerów wyczerpany — cykluje. Dodaj więcej pytań.",
          );
          warnedOverflow = true;
        }
        idx = idx % shuffled.length;
      }
      result.push({
        roundNumber: r + 1,
        tableNumber: table.tableNumber,
        question: shuffled[idx++].text,
      });
    }
  }

  return result;
}

/**
 * Zwraca następne nieużyte pytanie z banku.
 * Używane przez `replaceIcebreaker` action gdy organizator wymienia pytanie.
 */
export function nextUnusedQuestion(usedQuestions: Set<string>): string | null {
  return BANK.find((q) => !usedQuestions.has(q.text))?.text ?? null;
}
