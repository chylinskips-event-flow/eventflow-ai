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

/**
 * Szybkie sprawdzenie (bez pełnych danych): czy uczestnik ma aktywny plan mixera.
 * Używane w layout + home page do warunkowego wyświetlania kafelka/linku.
 */
export async function hasActiveMixerForAttendee(attendeeId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: participant } = await supabase
    .from("mixer_participants")
    .select("mixer_id")
    .eq("attendee_id", attendeeId)
    .eq("status", "active")
    .maybeSingle();

  if (!participant) return false;

  const { data: mixer } = await supabase
    .from("mixers")
    .select("id")
    .eq("id", (participant as { mixer_id: string }).mixer_id)
    .in("status", ["generated", "locked", "running", "finished"])
    .maybeSingle();

  return !!mixer;
}

export async function getMixerForAttendee(
  slug: string,
): Promise<MyMixerData | null> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) return null;

  const supabase = createAdminClient();

  // Znajdź mixer_participant dla tego uczestnika (tylko active)
  const { data: participantRow } = await supabase
    .from("mixer_participants")
    .select("id, mixer_id")
    .eq("attendee_id", attendee.id)
    .eq("status", "active")
    .maybeSingle();

  if (!participantRow) return null;

  const { mixer_id, id: participantId } = participantRow as {
    id: string;
    mixer_id: string;
  };

  // Sprawdź czy mixer należy do tego eventu i jest wygenerowany/zablokowany
  const { data: mixer } = await supabase
    .from("mixers")
    .select("id, name, event_id, status, rounds_count, round_minutes, break_minutes, break_after_round")
    .eq("id", mixer_id)
    .eq("event_id", attendee.event_id)
    .in("status", ["generated", "locked", "running", "finished"])
    .maybeSingle();

  if (!mixer) return null;

  const m = mixer as {
    id: string;
    name: string;
    event_id: string;
    status: string;
    rounds_count: number;
    round_minutes: number;
    break_minutes: number;
    break_after_round: number | null;
  };

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
