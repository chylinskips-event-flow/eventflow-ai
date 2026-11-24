// Loteria: pula losowania i ważone losowanie (czysta logika, testowalna) oraz odczyt z bazy.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeById, fetchAllRows } from "@/lib/paginate";

export type LotteryCandidate = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  points: number;
};

export type LotteryEntry = LotteryCandidate & { tickets: number };

/** 1 bilet za każde `pointsPerTicket` punktów; w puli tylko osoby z ≥1 biletem i bez wykluczenia. */
export function buildLotteryPool(
  candidates: LotteryCandidate[],
  pointsPerTicket: number,
  excluded: ReadonlySet<string>,
): LotteryEntry[] {
  if (!(pointsPerTicket > 0)) return [];
  return candidates
    .map((a) => ({ ...a, points: a.points ?? 0, tickets: Math.floor((a.points ?? 0) / pointsPerTicket) }))
    .filter((a) => a.tickets >= 1 && !excluded.has(a.id));
}

/** Ważone losowanie: suma skumulowana + jeden punkt z [0, totalTickets). `rand` ∈ [0, 1). */
export function pickWeightedWinner(
  pool: LotteryEntry[],
  rand: number,
): { winner: LotteryEntry; totalTickets: number } | null {
  if (pool.length === 0) return null;
  const totalTickets = pool.reduce((s, a) => s + a.tickets, 0);
  const roll = rand * totalTickets;
  let cumulative = 0;
  for (const a of pool) {
    cumulative += a.tickets;
    if (roll < cumulative) return { winner: a, totalTickets };
  }
  return { winner: pool[pool.length - 1], totalTickets };
}

// ---------------------------------------------------------------------------
// Odczyt z bazy (wywoływać po stronie serwera, po autoryzacji organizatora)
// ---------------------------------------------------------------------------

/** Zatwierdzeni uczestnicy z co najmniej `minPoints` punktami — wszyscy, stronami. */
export async function loadLotteryCandidates(
  db: SupabaseClient,
  eventId: string,
  minPoints: number,
): Promise<{ data: LotteryCandidate[]; error: unknown }> {
  const { data, error } = await fetchAllRows<LotteryCandidate>((from, to) =>
    db
      .from("attendees")
      .select("id, first_name, last_name, company, points")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .gte("points", minPoints)
      .order("id", { ascending: true })
      .range(from, to),
  );
  // Punkty zmieniają się w trakcie eventu, więc strony mogą się nakładać — każdy uczestnik raz.
  return {
    data: dedupeById(data).map((a) => ({
      id: a.id,
      first_name: a.first_name ?? null,
      last_name: a.last_name ?? null,
      company: a.company ?? null,
      points: a.points ?? 0,
    })),
    error,
  };
}

/** Uczestnicy wykluczeni z losowania w tym evencie (zapisane w bazie). */
export async function loadLotteryExclusions(
  db: SupabaseClient,
  eventId: string,
): Promise<{ data: string[]; error: unknown }> {
  const { data, error } = await fetchAllRows<{ attendee_id: string }>((from, to) =>
    db
      .from("lottery_exclusions")
      .select("attendee_id")
      .eq("event_id", eventId)
      .order("attendee_id", { ascending: true })
      .range(from, to),
  );
  return { data: data.map((r) => r.attendee_id), error };
}
