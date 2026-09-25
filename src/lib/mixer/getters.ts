/**
 * Gettery dla widoków organizatora — używane w Server Components.
 * Każda funkcja zawiera guard getOwnEvent(eventId), bo tabele mixera mają RLS deny-all
 * (dostęp tylko przez service_role).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";

// ── Typy wierszy DB ─────────────────────────────────────────────────────────

export type MixerRow = {
  id: string;
  event_id: string;
  name: string;
  status: "draft" | "generated" | "locked" | "running" | "finished";
  rounds_count: number;
  break_after_round: number | null;
  round_minutes: number;
  break_minutes: number;
  table_count: number;
  seat_min: number;
  seat_max: number;
  seed: number;
  quality: QualityJson | null;
  present_token: string | null;
  created_at: string;
  updated_at: string;
};

// ── mixer_rounds ───────────────────────────────────────────────────────────

export type MixerRound = {
  id: string;
  mixer_id: string;
  round_number: number;
  status: "pending" | "active" | "done";
  started_at: string | null;
  created_at: string;
};

export type QualityJson = {
  feasible: boolean;
  infeasibleReason?: string;
  uniqueMeetingsMin: number;
  uniqueMeetingsMed: number;
  uniqueMeetingsMax: number;
  repeatedPairs: number;
  clusterIncidents: number;
};

export type MixerParticipant = {
  id: string;
  mixer_id: string;
  attendee_id: string | null;
  display_name: string;
  company: string | null;
  status: "active" | "absent" | "dropped";
  dropped_at: string | null;
  created_at: string;
};

export type MixerAssignment = {
  id: string;
  mixer_id: string;
  round_number: number;
  table_number: number;
  participant_id: string;
};

export type MixerIcebreaker = {
  id: string;
  mixer_id: string;
  round_number: number;
  table_number: number;
  question: string;
  is_custom: boolean;
};

// ── Plan widok: runda → stolik → uczestnicy + pytanie ──────────────────────

export type PlanTable = {
  tableNumber: number;
  participants: Pick<MixerParticipant, "id" | "display_name" | "company" | "status">[];
  question: string | null;
  icebreakerIsCustom: boolean;
  icebreakerId: string | null;
};

export type PlanRound = {
  roundNumber: number;
  tables: PlanTable[];
};

// ── Rundy mixera (live-run state) ─────────────────────────────────────────

export async function getMixerRounds(
  mixerId: string,
  eventId: string,
): Promise<MixerRound[]> {
  const event = await getOwnEvent(eventId);
  if (!event) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mixer_rounds")
    .select("*")
    .eq("mixer_id", mixerId)
    .order("round_number");

  return (data ?? []) as MixerRound[];
}

// ── Lista mixerów ──────────────────────────────────────────────────────────

export async function getMixers(eventId: string): Promise<MixerRow[]> {
  const event = await getOwnEvent(eventId);
  if (!event) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mixers")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return (data ?? []) as MixerRow[];
}

// ── Szczegóły mixera ───────────────────────────────────────────────────────

export async function getMixer(
  mixerId: string,
  eventId: string,
): Promise<MixerRow | null> {
  const event = await getOwnEvent(eventId);
  if (!event) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mixers")
    .select("*")
    .eq("id", mixerId)
    .eq("event_id", eventId)
    .maybeSingle();

  return (data as MixerRow | null) ?? null;
}

// ── Uczestnicy mixera ──────────────────────────────────────────────────────

export async function getMixerParticipants(
  mixerId: string,
  eventId: string,
): Promise<MixerParticipant[]> {
  const event = await getOwnEvent(eventId);
  if (!event) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mixer_participants")
    .select("*")
    .eq("mixer_id", mixerId)
    .order("display_name", { ascending: true });

  return (data ?? []) as MixerParticipant[];
}

// ── Plan mixera (widok wg rundy) ───────────────────────────────────────────

export async function getMixerPlan(
  mixerId: string,
  eventId: string,
): Promise<PlanRound[]> {
  const event = await getOwnEvent(eventId);
  if (!event) return [];

  const supabase = createAdminClient();

  const [{ data: assignments }, { data: icebreakers }, { data: participants }] =
    await Promise.all([
      supabase
        .from("mixer_assignments")
        .select("id, round_number, table_number, participant_id")
        .eq("mixer_id", mixerId)
        .order("round_number")
        .order("table_number"),
      supabase
        .from("mixer_icebreakers")
        .select("id, round_number, table_number, question, is_custom")
        .eq("mixer_id", mixerId),
      supabase
        .from("mixer_participants")
        .select("id, display_name, company, status")
        .eq("mixer_id", mixerId),
    ]);

  const participantMap = new Map(
    ((participants ?? []) as Pick<MixerParticipant, "id" | "display_name" | "company" | "status">[]).map(
      (p) => [p.id, p],
    ),
  );

  const icebreakerMap = new Map(
    ((icebreakers ?? []) as MixerIcebreaker[]).map((ib) => [
      `${ib.round_number}:${ib.table_number}`,
      ib,
    ]),
  );

  // Group assignments by round then table
  const roundMap = new Map<number, Map<number, string[]>>();
  for (const a of (assignments ?? []) as MixerAssignment[]) {
    if (!roundMap.has(a.round_number)) roundMap.set(a.round_number, new Map());
    const tableMap = roundMap.get(a.round_number)!;
    if (!tableMap.has(a.table_number)) tableMap.set(a.table_number, []);
    tableMap.get(a.table_number)!.push(a.participant_id);
  }

  const rounds: PlanRound[] = [];
  for (const [roundNumber, tableMap] of Array.from(roundMap).sort((a, b) => a[0] - b[0])) {
    const tables: PlanTable[] = [];
    for (const [tableNumber, pids] of Array.from(tableMap).sort((a, b) => a[0] - b[0])) {
      const ib = icebreakerMap.get(`${roundNumber}:${tableNumber}`);
      tables.push({
        tableNumber,
        participants: pids
          .map((id) => participantMap.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null),
        question: ib?.question ?? null,
        icebreakerIsCustom: ib?.is_custom ?? false,
        icebreakerId: ib?.id ?? null,
      });
    }
    rounds.push({ roundNumber, tables });
  }

  return rounds;
}

// ── Projector (public read-only by present_token) ──────────────────────────

export type ProjectorTable = {
  tableNumber: number;
  participants: { display_name: string; company: string | null }[];
  question: string | null;
};

export type MixerLiveState = {
  mixerId: string;
  mixerName: string;
  mixerStatus: string;
  roundsCount: number;
  roundMinutes: number;
  breakAfterRound: number | null;
  presentToken: string;
  activeRound: {
    roundNumber: number;
    startedAt: string | null;
    tables: ProjectorTable[];
  } | null;
};

export async function getMixerLiveState(
  presentToken: string,
): Promise<MixerLiveState | null> {
  const supabase = createAdminClient();

  const { data: mixerRaw } = await supabase
    .from("mixers")
    .select("id, name, status, rounds_count, round_minutes, break_after_round, present_token")
    .eq("present_token", presentToken)
    .maybeSingle();

  if (!mixerRaw) return null;

  const mixer = mixerRaw as {
    id: string;
    name: string;
    status: string;
    rounds_count: number;
    round_minutes: number;
    break_after_round: number | null;
    present_token: string;
  };

  const { data: activeRoundRaw } = await supabase
    .from("mixer_rounds")
    .select("round_number, started_at")
    .eq("mixer_id", mixer.id)
    .eq("status", "active")
    .maybeSingle();

  let activeRound: MixerLiveState["activeRound"] = null;

  if (activeRoundRaw) {
    const ar = activeRoundRaw as { round_number: number; started_at: string | null };

    const [{ data: assignmentsRaw }, { data: participantsRaw }, { data: icebreakersRaw }] =
      await Promise.all([
        supabase
          .from("mixer_assignments")
          .select("table_number, participant_id")
          .eq("mixer_id", mixer.id)
          .eq("round_number", ar.round_number)
          .order("table_number"),
        supabase
          .from("mixer_participants")
          .select("id, display_name, company")
          .eq("mixer_id", mixer.id)
          .eq("status", "active"),
        supabase
          .from("mixer_icebreakers")
          .select("table_number, question")
          .eq("mixer_id", mixer.id)
          .eq("round_number", ar.round_number),
      ]);

    const participantMap = new Map(
      ((participantsRaw ?? []) as { id: string; display_name: string; company: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );

    const icebreakerMap = new Map(
      ((icebreakersRaw ?? []) as { table_number: number; question: string }[]).map(
        (ib) => [ib.table_number, ib.question],
      ),
    );

    const tableMap = new Map<number, string[]>();
    for (const a of (assignmentsRaw ?? []) as { table_number: number; participant_id: string }[]) {
      if (!tableMap.has(a.table_number)) tableMap.set(a.table_number, []);
      tableMap.get(a.table_number)!.push(a.participant_id);
    }

    const tables: ProjectorTable[] = Array.from(tableMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([tableNumber, pids]) => ({
        tableNumber,
        participants: pids
          .map((id) => participantMap.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map((p) => ({ display_name: p.display_name, company: p.company })),
        question: icebreakerMap.get(tableNumber) ?? null,
      }));

    activeRound = { roundNumber: ar.round_number, startedAt: ar.started_at, tables };
  }

  return {
    mixerId: mixer.id,
    mixerName: mixer.name,
    mixerStatus: mixer.status,
    roundsCount: mixer.rounds_count,
    roundMinutes: mixer.round_minutes,
    breakAfterRound: mixer.break_after_round,
    presentToken: mixer.present_token,
    activeRound,
  };
}
