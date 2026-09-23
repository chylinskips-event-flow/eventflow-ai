"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";
import { assign } from "@/lib/mixer/assign";
import { assignIcebreakers, nextUnusedQuestion } from "@/lib/mixer/icebreakers";
import type { MixerRow } from "@/lib/mixer/getters";

export type MixerFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/mixer`);
}

// ── createMixer ─────────────────────────────────────────────────────────────

export async function createMixer(
  eventId: string,
  _prev: MixerFormState,
  formData: FormData,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { status: "error", message: "Podaj nazwę mixera." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("mixers").insert({
    event_id: eventId,
    name,
  });

  if (error) return { status: "error", message: "Nie udało się utworzyć mixera." };

  revalidate(eventId);
  return { status: "success", message: "Mixer utworzony." };
}

// ── updateParams ─────────────────────────────────────────────────────────────

export async function updateParams(
  mixerId: string,
  eventId: string,
  _prev: MixerFormState,
  formData: FormData,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const table_count      = parseInt(formData.get("table_count")      as string, 10);
  const seat_min         = parseInt(formData.get("seat_min")         as string, 10);
  const seat_max         = parseInt(formData.get("seat_max")         as string, 10);
  const rounds_count     = parseInt(formData.get("rounds_count")     as string, 10);
  const round_minutes    = parseInt(formData.get("round_minutes")    as string, 10);
  const break_minutes    = parseInt(formData.get("break_minutes")    as string, 10);
  const breakAfterRaw    = (formData.get("break_after_round") as string)?.trim();
  const break_after_round = breakAfterRaw === "" || breakAfterRaw == null
    ? null
    : parseInt(breakAfterRaw, 10);

  if (
    isNaN(table_count) || table_count < 1 ||
    isNaN(seat_min)    || seat_min < 2    ||
    isNaN(seat_max)    || seat_max < seat_min ||
    isNaN(rounds_count)  || rounds_count < 1  ||
    isNaN(round_minutes) || round_minutes < 1  ||
    isNaN(break_minutes) || break_minutes < 0
  ) {
    return { status: "error", message: "Sprawdź wartości parametrów." };
  }

  if (break_after_round !== null && (isNaN(break_after_round) || break_after_round < 1 || break_after_round >= rounds_count)) {
    return { status: "error", message: "Przerwa musi być po rundzie 1...(rundy-1)." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mixers")
    .update({
      table_count,
      seat_min,
      seat_max,
      rounds_count,
      round_minutes,
      break_minutes,
      break_after_round,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mixerId)
    .eq("event_id", eventId);

  if (error) return { status: "error", message: "Nie udało się zapisać parametrów." };

  revalidate(eventId);
  return { status: "success", message: "Parametry zapisane." };
}

// ── addParticipants ──────────────────────────────────────────────────────────

export async function addParticipants(
  mixerId: string,
  eventId: string,
  attendeeIds: string[],
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  if (attendeeIds.length === 0) return { status: "success" };

  const supabase = createAdminClient();

  // Snapshot display_name + company z tabeli attendees
  const { data: attendees, error: fetchErr } = await supabase
    .from("attendees")
    .select("id, first_name, last_name, company")
    .in("id", attendeeIds)
    .eq("event_id", eventId);

  if (fetchErr || !attendees) {
    return { status: "error", message: "Nie udało się pobrać uczestników." };
  }

  const rows = (attendees as { id: string; first_name: string; last_name: string; company: string | null }[]).map(
    (a) => ({
      mixer_id:     mixerId,
      attendee_id:  a.id,
      display_name: `${a.first_name} ${a.last_name}`.trim(),
      company:      a.company ?? null,
      status:       "active" as const,
    }),
  );

  const { error } = await supabase
    .from("mixer_participants")
    .upsert(rows, { onConflict: "mixer_id,attendee_id", ignoreDuplicates: false });

  if (error) return { status: "error", message: "Nie udało się dodać uczestników." };

  revalidate(eventId);
  return { status: "success", message: `Dodano ${rows.length} uczestników.` };
}

// ── setParticipantStatus ─────────────────────────────────────────────────────

export async function setParticipantStatus(
  participantId: string,
  mixerId: string,
  eventId: string,
  status: "active" | "absent" | "dropped",
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mixer_participants")
    .update({ status })
    .eq("id", participantId)
    .eq("mixer_id", mixerId);

  if (error) return { status: "error", message: "Nie udało się zmienić statusu." };

  revalidate(eventId);
  return { status: "success" };
}

// ── generatePlan (shared core) ───────────────────────────────────────────────

async function runGenerate(
  mixerId: string,
  eventId: string,
  overrideSeed?: number,
): Promise<MixerFormState> {
  const supabase = createAdminClient();

  // 1. Pobierz mixer i zweryfikuj ownership (event_id match)
  const { data: mixerRaw } = await supabase
    .from("mixers")
    .select("*")
    .eq("id", mixerId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!mixerRaw) return { status: "error", message: "Mixer nie znaleziony." };
  const mixer = mixerRaw as MixerRow;

  const seed = overrideSeed ?? mixer.seed;

  // Jeśli nowe ziarno — zaktualizuj w DB przed generacją
  if (overrideSeed !== undefined) {
    await supabase
      .from("mixers")
      .update({ seed: overrideSeed, updated_at: new Date().toISOString() })
      .eq("id", mixerId)
      .eq("event_id", eventId);
  }

  // 2. Pobierz aktywnych uczestników
  const { data: participants } = await supabase
    .from("mixer_participants")
    .select("id")
    .eq("mixer_id", mixerId)
    .eq("status", "active");

  const pids = ((participants ?? []) as { id: string }[]).map((p) => p.id);

  if (pids.length < 2) {
    return { status: "error", message: "Potrzeba co najmniej 2 aktywnych uczestników." };
  }

  // 3. Uruchom algorytm
  const result = assign({
    participantIds: pids,
    rounds:     mixer.rounds_count,
    tableCount: mixer.table_count,
    seatMin:    mixer.seat_min,
    seatMax:    mixer.seat_max,
    seed,
  });

  if (!result.quality.feasible) {
    return {
      status: "error",
      message: result.quality.infeasibleReason ?? "Niewykonalne — zmień parametry stolików.",
    };
  }

  // 4. Usuń stary plan
  await Promise.all([
    supabase.from("mixer_assignments").delete().eq("mixer_id", mixerId),
    supabase.from("mixer_icebreakers").delete().eq("mixer_id", mixerId),
  ]);

  // 5. Wstaw nowe przydziały (batch)
  const assignmentRows = result.rounds.flatMap((round, ri) =>
    round.flatMap((table) =>
      table.participantIds.map((pid) => ({
        mixer_id:      mixerId,
        round_number:  ri + 1,
        table_number:  table.tableNumber,
        participant_id: pid,
      })),
    ),
  );

  const { error: assignErr } = await supabase
    .from("mixer_assignments")
    .insert(assignmentRows);

  if (assignErr) return { status: "error", message: "Błąd zapisu przydziałów." };

  // 6. Wstaw ice-breakery (batch)
  const icebreakerAssignments = assignIcebreakers(result.rounds, seed);
  const icebreakerRows = icebreakerAssignments.map((ib) => ({
    mixer_id:     mixerId,
    round_number: ib.roundNumber,
    table_number: ib.tableNumber,
    question:     ib.question,
    is_custom:    false,
  }));

  const { error: ibErr } = await supabase
    .from("mixer_icebreakers")
    .insert(icebreakerRows);

  if (ibErr) return { status: "error", message: "Błąd zapisu ice-breakerów." };

  // 7. Zaktualizuj status + quality
  await supabase
    .from("mixers")
    .update({
      status:     "generated",
      quality:    result.quality,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mixerId)
    .eq("event_id", eventId);

  revalidate(eventId);
  return { status: "success", message: "Plan wygenerowany." };
}

// ── generatePlan ─────────────────────────────────────────────────────────────

export async function generatePlan(
  mixerId: string,
  eventId: string,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  return runGenerate(mixerId, eventId);
}

// ── rerollPlan ───────────────────────────────────────────────────────────────

export async function rerollPlan(
  mixerId: string,
  eventId: string,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const newSeed = Math.floor(Math.random() * 2147483647);
  return runGenerate(mixerId, eventId, newSeed);
}

// ── updateIcebreaker ─────────────────────────────────────────────────────────

export async function updateIcebreaker(
  icebreakerId: string,
  mixerId: string,
  eventId: string,
  question: string,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const trimmed = question.trim();
  if (!trimmed) return { status: "error", message: "Pytanie nie może być puste." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mixer_icebreakers")
    .update({ question: trimmed, is_custom: true })
    .eq("id", icebreakerId)
    .eq("mixer_id", mixerId);

  if (error) return { status: "error", message: "Nie udało się zaktualizować pytania." };

  revalidate(eventId);
  return { status: "success", message: "Pytanie zaktualizowane." };
}

// ── replaceIcebreaker ────────────────────────────────────────────────────────

// ── seedTestAttendees (helper dla testów, usuń przed pilotem) ────────────────

export async function seedTestAttendees(
  eventId: string,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const names: [string, string, string][] = [
    ["Anna",    "Kowalska",   "Acme Sp. z o.o."],
    ["Piotr",   "Nowak",      "TechWave SA"],
    ["Maria",   "Wiśniewska", "BlueSoft"],
    ["Krzysztof","Wójcik",    "DataCore"],
    ["Katarzyna","Kamińska",  "Nexus Digital"],
    ["Michał",  "Lewandowski","CloudBase"],
    ["Agnieszka","Zielińska", "Pixels & Co"],
    ["Tomasz",  "Szymański",  "IronStack"],
    ["Monika",  "Woźniak",    "Bright Labs"],
    ["Marek",   "Dąbrowski",  "Vertex Media"],
    ["Joanna",  "Kozłowska",  "DevOps House"],
    ["Rafał",   "Jankowski",  "AI Works"],
    ["Ewa",     "Mazur",      "EcoTech"],
    ["Paweł",   "Kwiatkowski","SkyNet PL"],
    ["Barbara", "Krawczyk",   "SmartFlow"],
    ["Łukasz",  "Piotrowska", "Omni Data"],
    ["Natalia", "Grabowska",  "Forza Studio"],
    ["Grzegorz","Nowakowska", "WarpCode"],
    ["Sylwia",  "Pawlak",     "Sigma Systems"],
    ["Jakub",   "Michalski",  "Zero One Labs"],
  ];

  const supabase = createAdminClient();
  const rows = names.map(([first_name, last_name, company]) => ({
    event_id:      eventId,
    first_name,
    last_name,
    company,
    email:         `${first_name.toLowerCase()}.${last_name.toLowerCase()}@testmixer.dev`,
    status:        "approved" as const,
    qr_code_token: crypto.randomUUID(),
    contact_code:  Math.random().toString(36).substring(2, 8).toUpperCase(),
  }));

  const { error } = await supabase.from("attendees").insert(rows);
  if (error) return { status: "error", message: "Błąd seedowania: " + error.message };

  revalidatePath(`/admin/events/${eventId}/attendees`);
  return { status: "success", message: "Dodano 20 uczestników testowych." };
}

export async function replaceIcebreaker(
  icebreakerId: string,
  mixerId: string,
  eventId: string,
): Promise<MixerFormState> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Event nie znaleziony." };

  const supabase = createAdminClient();

  // Pobierz zestaw już używanych pytań w tym mixerze
  const { data: existing } = await supabase
    .from("mixer_icebreakers")
    .select("question")
    .eq("mixer_id", mixerId);

  const usedQuestions = new Set(
    ((existing ?? []) as { question: string }[]).map((r) => r.question),
  );

  const next = nextUnusedQuestion(usedQuestions);
  if (!next) {
    return { status: "error", message: "Bank pytań wyczerpany — wszystkie pytania są już użyte." };
  }

  const { error } = await supabase
    .from("mixer_icebreakers")
    .update({ question: next, is_custom: false })
    .eq("id", icebreakerId)
    .eq("mixer_id", mixerId);

  if (error) return { status: "error", message: "Nie udało się wymienić pytania." };

  revalidate(eventId);
  return { status: "success", message: "Pytanie wymienione." };
}
