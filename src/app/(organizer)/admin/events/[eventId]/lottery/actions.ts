"use server";

import { revalidatePath } from "next/cache";
import { featureGate } from "@/lib/entitlements";
import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildLotteryPool,
  loadLotteryCandidates,
  loadLotteryExclusions,
  pickWeightedWinner,
} from "@/lib/lottery";

export type DrawResult =
  | {
      status: "ok";
      winner: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        company: string | null;
        points: number;
        tickets: number;
      };
    }
  | { status: "empty" }
  | { status: "error"; message: string };

export type LotteryExclusionResult = { status: "ok" } | { status: "error"; message: string };

type LotteryAuth = { ok: true; ppt: number } | { ok: false; message: string };

/** Organizator eventu z aktywną loterią (i planem z nagrodami) — inaczej komunikat błędu. */
async function authorizeLottery(eventId: string): Promise<LotteryAuth> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, message: "Brak dostępu do eventu." };
  if (!event.gamification_enabled || event.lottery_points_per_ticket == null) {
    return { ok: false, message: "Loteria nieaktywna dla tego eventu." };
  }
  const gate = await featureGate(event.organization_id, "gamification_rewards");
  if (!gate.ok) return { ok: false, message: gate.message };
  return { ok: true, ppt: event.lottery_points_per_ticket };
}

export async function drawLotteryWinner(
  eventId: string,
  excludedIds: string[],
): Promise<DrawResult> {
  const auth = await authorizeLottery(eventId);
  if (!auth.ok) return { status: "error", message: auth.message };
  const { ppt } = auth;
  const admin = createAdminClient();

  // Pełna lista (stronami — PostgREST zwraca maks. 1000 wierszy na zapytanie)
  const [candidates, exclusions] = await Promise.all([
    loadLotteryCandidates(admin, eventId, ppt),
    loadLotteryExclusions(admin, eventId),
  ]);
  if (candidates.error || exclusions.error) {
    return { status: "error", message: "Nie udało się pobrać listy uczestników." };
  }

  // Wykluczenia zapisane w bazie obowiązują zawsze (także po odświeżeniu strony i na innym
  // urządzeniu); lista z przeglądarki może je tylko uzupełnić.
  const excluded = new Set([...exclusions.data, ...(excludedIds ?? [])]);
  const pool = buildLotteryPool(candidates.data, ppt, excluded);
  const picked = pickWeightedWinner(pool, Math.random());
  if (!picked) return { status: "empty" };
  const { winner, totalTickets } = picked;

  // Zapisz do event_analytics_log (RLS deny-all → admin client)
  await admin.from("event_analytics_log").insert({
    event_id: eventId,
    attendee_id: winner.id,
    action_type: "lottery_winner",
    metadata: {
      tickets: winner.tickets,
      total_tickets: totalTickets,
      excluded_count: excluded.size,
      round: excluded.size + 1,
    },
  });

  return { status: "ok", winner };
}

/** Wyklucza uczestnika z kolejnych losowań (zapis w bazie). */
export async function excludeLotteryAttendee(
  eventId: string,
  attendeeId: string,
): Promise<LotteryExclusionResult> {
  const auth = await authorizeLottery(eventId);
  if (!auth.ok) return { status: "error", message: auth.message };
  const admin = createAdminClient();

  // Tylko uczestnik tego eventu
  const { data: attendee } = await admin
    .from("attendees")
    .select("id")
    .eq("id", attendeeId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!attendee) return { status: "error", message: "Uczestnik nie znaleziony." };

  const { error } = await admin
    .from("lottery_exclusions")
    .upsert(
      { event_id: eventId, attendee_id: attendeeId },
      { onConflict: "attendee_id", ignoreDuplicates: true },
    );
  if (error) return { status: "error", message: "Nie udało się zapisać wykluczenia." };

  revalidatePath(`/admin/events/${eventId}/lottery`);
  return { status: "ok" };
}

/** Przywraca uczestnika do puli losowania. */
export async function restoreLotteryAttendee(
  eventId: string,
  attendeeId: string,
): Promise<LotteryExclusionResult> {
  const auth = await authorizeLottery(eventId);
  if (!auth.ok) return { status: "error", message: auth.message };
  const admin = createAdminClient();

  const { error } = await admin
    .from("lottery_exclusions")
    .delete()
    .eq("event_id", eventId)
    .eq("attendee_id", attendeeId);
  if (error) return { status: "error", message: "Nie udało się przywrócić uczestnika." };

  revalidatePath(`/admin/events/${eventId}/lottery`);
  return { status: "ok" };
}

/** Czyści wszystkie wykluczenia loterii w evencie. */
export async function resetLotteryExclusions(eventId: string): Promise<LotteryExclusionResult> {
  const auth = await authorizeLottery(eventId);
  if (!auth.ok) return { status: "error", message: auth.message };
  const admin = createAdminClient();

  const { error } = await admin.from("lottery_exclusions").delete().eq("event_id", eventId);
  if (error) return { status: "error", message: "Nie udało się zresetować wykluczeń." };

  revalidatePath(`/admin/events/${eventId}/lottery`);
  return { status: "ok" };
}
