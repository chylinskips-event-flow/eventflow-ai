import { createAdminClient } from "@/lib/supabase/admin";

export type GamificationLevel = "explorer" | "connector" | "ambassador";

const LEVEL_THRESHOLDS: { name: GamificationLevel; min: number }[] = [
  { name: "ambassador", min: 250 },
  { name: "connector", min: 100 },
  { name: "explorer", min: 0 },
];

export function computeLevel(points: number): GamificationLevel {
  for (const { name, min } of LEVEL_THRESHOLDS) {
    if (points >= min) return name;
  }
  return "explorer";
}

export type CompleteQuestParams = {
  attendeeId: string;
  questId: string;
  partnerId: string;
  answeredCorrectly: boolean | null;
  pointsAwarded: number;
  leadConsent: boolean;
  consentTextVersion: string | null;
};

export type CompleteQuestResult =
  | { ok: true; pointsAwarded: number; newLevel: GamificationLevel; levelUp: boolean }
  | { ok: false; reason: "already_done" };

/**
 * Transakcyjna sekwencja zapisu po zaliczeniu questa (lub wyczerpaniu prób).
 * Kolejność zapewnia spójność przy powtórnych próbach:
 *   1. checkin (idempotent — UNIQUE attendee_id+partner_id)
 *   2. lead_consent (jeśli wyrażona)
 *   3. quest_completions (UNIQUE quest_id+attendee_id — drugie wywołanie → already_done)
 *   4. attendees.points += pointsAwarded (tylko po udanym INSERT w kroku 3)
 */
export async function completeQuest(
  params: CompleteQuestParams,
): Promise<CompleteQuestResult> {
  const supabase = createAdminClient();

  // 1. Upewnij się, że wiersz checkin istnieje (nie nadpisuj istniejącego)
  await supabase
    .from("checkins")
    .upsert(
      { attendee_id: params.attendeeId, partner_id: params.partnerId },
      { onConflict: "attendee_id,partner_id", ignoreDuplicates: true },
    );

  // Jeśli wyrażono zgodę — ustaw flagę (tylko w górę: true nie wraca do false)
  if (params.leadConsent) {
    await supabase
      .from("checkins")
      .update({ lead_consent_given: true })
      .eq("attendee_id", params.attendeeId)
      .eq("partner_id", params.partnerId);
  }

  // 2. Zapis audit-log zgody leadowej
  if (params.leadConsent && params.consentTextVersion) {
    const { data: checkinRow } = await supabase
      .from("checkins")
      .select("id")
      .eq("attendee_id", params.attendeeId)
      .eq("partner_id", params.partnerId)
      .single();

    if (checkinRow) {
      await supabase.from("lead_consents").insert({
        checkin_id: (checkinRow as { id: string }).id,
        consent_text_version: params.consentTextVersion,
      });
    }
  }

  // 3. Zapis ukończenia questa (UNIQUE — drugi INSERT → already_done, bez punktów)
  const { error: completionError } = await supabase
    .from("quest_completions")
    .insert({
      quest_id: params.questId,
      attendee_id: params.attendeeId,
      answered_correctly: params.answeredCorrectly,
      points_awarded: params.pointsAwarded,
    });

  if (completionError) {
    if (completionError.code === "23505") {
      return { ok: false, reason: "already_done" };
    }
    throw completionError;
  }

  // 4. Dolicz punkty + przelicz poziom (po potwierdzeniu INSERT quest_completions)
  const { data: attendee } = await supabase
    .from("attendees")
    .select("points")
    .eq("id", params.attendeeId)
    .single();

  const oldPoints = ((attendee as { points: number } | null)?.points) ?? 0;
  const oldLevel = computeLevel(oldPoints);
  const newPoints = oldPoints + params.pointsAwarded;
  const newLevel = computeLevel(newPoints);

  await supabase
    .from("attendees")
    .update({ points: newPoints, level: newLevel })
    .eq("id", params.attendeeId);

  return {
    ok: true,
    pointsAwarded: params.pointsAwarded,
    newLevel,
    levelUp: newLevel !== oldLevel,
  };
}
