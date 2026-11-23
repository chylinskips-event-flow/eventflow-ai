/**
 * Getter dla widoku uczestnika „Mój mixer".
 * Tożsamość uczestnika ustalana wyłącznie serwerowo przez getCurrentAttendee(slug).
 * Nigdy nie przyjmuje attendeeId od klienta.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAttendee } from "@/lib/attendee-session";

export type MixerRoundLiveStatus = "pending" | "active" | "done";

export type MyMixerRound = {
  roundNumber: number;
  tableNumber: number;
  question: string | null;
  isBreakAfter: boolean;
  tablemates: { display_name: string; company: string | null }[];
  liveStatus: MixerRoundLiveStatus;
  startedAt: string | null;
};

export type MyMixerData = {
  mixerName: string;
  roundMinutes: number;
  breakMinutes: number;
  breakAfterRound: number | null;
  rounds: MyMixerRound[];
  isLive: boolean;
  isFinished: boolean;
};

const VISIBLE_MIXER_STATUSES = ["generated", "locked", "running", "finished"] as const;

type MixerCandidate = {
  id: string;
  name: string;
  event_id: string;
  status: string;
  rounds_count: number;
  round_minutes: number;
  break_minutes: number;
  break_after_round: number | null;
  updated_at: string;
  created_at: string;
};

const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  locked: 1,
  generated: 1,
  finished: 2,
};

/**
 * Wybiera jeden mixer do pokazania uczestnikowi, gdy jest w kilku mikserach
 * tego samego wydarzenia. Kolejność deterministyczna:
 * 1. trwający (running), 2. przygotowany (locked/generated), 3. zakończony;
 * w obrębie grupy — ostatnio aktualizowany, potem najnowszy, potem po id.
 */
export function pickMixerForAttendee<T extends Pick<MixerCandidate, "id" | "status" | "updated_at" | "created_at">>(
  mixers: T[],
): T | null {
  const visible = mixers.filter((m) => m.status in STATUS_PRIORITY);
  if (visible.length === 0) return null;
  return [...visible].sort(
    (a, b) =>
      STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
      (b.updated_at ?? "").localeCompare(a.updated_at ?? "") ||
      (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
      a.id.localeCompare(b.id),
  )[0];
}

/**
 * Aktywne wpisy uczestnika we wszystkich mikserach + wybrany mixer
 * (opcjonalnie zawężony do eventu). Nie używa maybeSingle — uczestnik może
 * być w kilku mikserach.
 */
async function findAttendeeMixer(
  supabase: ReturnType<typeof createAdminClient>,
  attendeeId: string,
  eventId?: string,
): Promise<{ participantId: string; mixer: MixerCandidate } | null> {
  const { data: participantRows } = await supabase
    .from("mixer_participants")
    .select("id, mixer_id")
    .eq("attendee_id", attendeeId)
    .eq("status", "active");

  const rows = (participantRows ?? []) as { id: string; mixer_id: string }[];
  if (rows.length === 0) return null;

  let query = supabase
    .from("mixers")
    .select("id, name, event_id, status, rounds_count, round_minutes, break_minutes, break_after_round, updated_at, created_at")
    .in("id", rows.map((r) => r.mixer_id))
    .in("status", [...VISIBLE_MIXER_STATUSES]);
  if (eventId) query = query.eq("event_id", eventId);
  const { data: mixers } = await query;

  const picked = pickMixerForAttendee((mixers ?? []) as MixerCandidate[]);
  if (!picked) return null;
  const participant = rows.find((r) => r.mixer_id === picked.id);
  if (!participant) return null;
  return { participantId: participant.id, mixer: picked };
}

/**
 * Szybkie sprawdzenie (bez pełnych danych): czy uczestnik ma aktywny plan mixera.
 * Używane w layout + home page do warunkowego wyświetlania kafelka/linku.
 */
export async function hasActiveMixerForAttendee(attendeeId: string): Promise<boolean> {
  const supabase = createAdminClient();
  return (await findAttendeeMixer(supabase, attendeeId)) !== null;
}

export async function getMixerForAttendee(
  slug: string,
): Promise<MyMixerData | null> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) return null;

  const supabase = createAdminClient();

  // Mixer musi należeć do eventu uczestnika i być wygenerowany/zablokowany/trwający/zakończony
  const found = await findAttendeeMixer(supabase, attendee.id, attendee.event_id);
  if (!found) return null;

  const { participantId, mixer: m } = found;
  const mixer_id = m.id;

  // Pobierz przydziały tego uczestnika, ice-breakery i live state rund równolegle
  const [
    { data: assignments },
    { data: icebreakers },
    { data: liveRoundsData },
  ] = await Promise.all([
    supabase
      .from("mixer_assignments")
      .select("round_number, table_number")
      .eq("mixer_id", mixer_id)
      .eq("participant_id", participantId)
      .order("round_number"),
    supabase
      .from("mixer_icebreakers")
      .select("round_number, table_number, question")
      .eq("mixer_id", mixer_id),
    supabase
      .from("mixer_rounds")
      .select("round_number, status, started_at")
      .eq("mixer_id", mixer_id),
  ]);

  const icebreakerMap = new Map(
    ((icebreakers ?? []) as { round_number: number; table_number: number; question: string }[]).map(
      (ib) => [`${ib.round_number}:${ib.table_number}`, ib.question],
    ),
  );

  const liveRoundMap = new Map(
    ((liveRoundsData ?? []) as { round_number: number; status: string; started_at: string | null }[]).map(
      (r) => [r.round_number, r],
    ),
  );

  // Pobierz współuczestników stołu (wszystkich przydziałów) — jedno zapytanie
  const { data: allAssignments } = await supabase
    .from("mixer_assignments")
    .select("round_number, table_number, participant_id")
    .eq("mixer_id", mixer_id);

  const { data: allParticipants } = await supabase
    .from("mixer_participants")
    .select("id, display_name, company")
    .eq("mixer_id", mixer_id)
    .eq("status", "active");

  const participantInfoMap = new Map(
    ((allParticipants ?? []) as { id: string; display_name: string; company: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  // Buduj tabelę: (round, table) → lista participant_id
  const tableAssignmentMap = new Map<string, string[]>();
  for (const a of (allAssignments ?? []) as { round_number: number; table_number: number; participant_id: string }[]) {
    const key = `${a.round_number}:${a.table_number}`;
    if (!tableAssignmentMap.has(key)) tableAssignmentMap.set(key, []);
    tableAssignmentMap.get(key)!.push(a.participant_id);
  }

  const rounds: MyMixerRound[] = ((assignments ?? []) as { round_number: number; table_number: number }[]).map(
    (a) => {
      const key = `${a.round_number}:${a.table_number}`;
      const tablePids = tableAssignmentMap.get(key) ?? [];
      const tablemates = tablePids
        .filter((pid) => pid !== participantId)
        .map((pid) => participantInfoMap.get(pid))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .map((p) => ({ display_name: p.display_name, company: p.company }));

      const live = liveRoundMap.get(a.round_number);
      return {
        roundNumber: a.round_number,
        tableNumber: a.table_number,
        question: icebreakerMap.get(key) ?? null,
        isBreakAfter: m.break_after_round === a.round_number,
        tablemates,
        liveStatus: ((live?.status ?? "pending") as MixerRoundLiveStatus),
        startedAt: live?.started_at ?? null,
      };
    },
  );

  return {
    mixerName: m.name,
    roundMinutes: m.round_minutes,
    breakMinutes: m.break_minutes,
    breakAfterRound: m.break_after_round,
    rounds,
    isLive: m.status === "running",
    isFinished: m.status === "finished",
  };
}
