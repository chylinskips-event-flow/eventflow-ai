import { createAdminClient } from "@/lib/supabase/admin";

export type GamificationLevel = "explorer" | "connector" | "networker" | "ambassador";

const LEVEL_THRESHOLDS: { name: GamificationLevel; min: number }[] = [
  { name: "ambassador", min: 500 },
  { name: "networker",  min: 250 },
  { name: "connector",  min: 100 },
  { name: "explorer",   min: 0 },
];

export function computeLevel(points: number): GamificationLevel {
  for (const { name, min } of LEVEL_THRESHOLDS) {
    if (points >= min) return name;
  }
  return "explorer";
}

export const LEVEL_LABELS: Record<GamificationLevel, string> = {
  explorer:   "Explorer",
  connector:  "Connector",
  networker:  "Networker",
  ambassador: "Ambassador",
};

/** Próg następnego poziomu, lub null gdy Ambassador (maks). */
export function computeNextLevelThreshold(points: number): number | null {
  if (points < 100) return 100;
  if (points < 250) return 250;
  if (points < 500) return 500;
  return null;
}

export type CompleteQuestParams = {
  attendeeId: string;
  questId: string;
  partnerId: string | null; // null dla questów bez stoiska (networking, profile)
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
 *   1. checkin (idempotent — UNIQUE attendee_id+partner_id; pomijany gdy brak partnera)
 *   2. lead_consent (jeśli wyrażona)
 *   3. quest_completions (UNIQUE quest_id+attendee_id — drugie wywołanie → already_done)
 *   4. attendees.points += pointsAwarded (tylko po udanym INSERT w kroku 3)
 */
export async function completeQuest(
  params: CompleteQuestParams,
): Promise<CompleteQuestResult> {
  const supabase = createAdminClient();

  // 1. Checkin tylko dla questów stoiskowych (partnerId != null)
  if (params.partnerId) {
    await supabase
      .from("checkins")
      .upsert(
        { attendee_id: params.attendeeId, partner_id: params.partnerId },
        { onConflict: "attendee_id,partner_id", ignoreDuplicates: true },
      );

    if (params.leadConsent) {
      await supabase
        .from("checkins")
        .update({ lead_consent_given: true })
        .eq("attendee_id", params.attendeeId)
        .eq("partner_id", params.partnerId);
    }

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
  }

  // 2. Zapis ukończenia questa (UNIQUE — drugi INSERT → already_done, bez punktów)
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

  // 3. Dolicz punkty + przelicz poziom (po potwierdzeniu INSERT quest_completions)
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

async function isGamificationEnabled(eventId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("events")
    .select("gamification_enabled")
    .eq("id", eventId)
    .single();
  return !!(data as { gamification_enabled: boolean } | null)?.gamification_enabled;
}

type PendingQuest = { id: string; points_value: number | null; target_value: number | null };

/**
 * Aktywne questy danego typu, których uczestnik jeszcze nie zaliczył. Event może mieć kilka
 * aktywnych questów tego samego typu — każdy oceniany jest niezależnie.
 */
async function pendingQuestsOfType(
  attendeeId: string,
  eventId: string,
  type: "networking_contacts" | "profile_complete",
): Promise<PendingQuest[]> {
  const supabase = createAdminClient();

  const { data: quests } = await supabase
    .from("quests")
    .select("id, points_value, target_value")
    .eq("event_id", eventId)
    .eq("type", type)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const rows = (quests ?? []) as PendingQuest[];
  if (rows.length === 0) return [];

  const { data: done } = await supabase
    .from("quest_completions")
    .select("quest_id")
    .eq("attendee_id", attendeeId)
    .in(
      "quest_id",
      rows.map((q) => q.id),
    );

  const doneIds = new Set(((done ?? []) as { quest_id: string }[]).map((c) => c.quest_id));
  return rows.filter((q) => !doneIds.has(q.id));
}

/**
 * Hook networking_contacts: sprawdza OBU uczestników zaakceptowanej wymiany.
 * Wywołuj po każdym zapisie contact_request ze status='accepted'.
 * No-op gdy gamification_enabled=false lub brak aktywnych niezaliczonych questów.
 * Każdy aktywny quest networking_contacts (własny target_value) oceniany niezależnie.
 */
export async function checkNetworkingQuestProgress(
  attendeeId: string,
  eventId: string,
): Promise<void> {
  if (!(await isGamificationEnabled(eventId))) return;

  const pending = await pendingQuestsOfType(attendeeId, eventId, "networking_contacts");
  if (pending.length === 0) return;

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("contact_requests")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "accepted")
    .or(`requester_id.eq.${attendeeId},recipient_id.eq.${attendeeId}`);

  for (const quest of pending) {
    const target = quest.target_value ?? 1;
    if ((count ?? 0) < target) continue;
    await completeQuest({
      attendeeId,
      questId: quest.id,
      partnerId: null,
      answeredCorrectly: null,
      pointsAwarded: quest.points_value ?? 0,
      leadConsent: false,
      consentTextVersion: null,
    });
  }
}

/**
 * Hook profile_complete: sprawdza kompletność profilu po jego zapisaniu.
 * Pola wymagane: company, job_title, industry, interests (niepusta), goal.
 * Avatar pominięty — opcjonalny. Każdy aktywny quest profile_complete zaliczany niezależnie.
 */
export async function checkProfileQuestProgress(
  attendeeId: string,
  eventId: string,
): Promise<void> {
  if (!(await isGamificationEnabled(eventId))) return;

  const pending = await pendingQuestsOfType(attendeeId, eventId, "profile_complete");
  if (pending.length === 0) return;

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("attendees")
    .select("company, job_title, industry, interests, goal")
    .eq("id", attendeeId)
    .single();

  if (!profile) return;

  const p = profile as {
    company: string | null;
    job_title: string | null;
    industry: string | null;
    interests: string[] | null;
    goal: string | null;
  };

  const isComplete =
    !!p.company &&
    !!p.job_title &&
    !!p.industry &&
    Array.isArray(p.interests) && p.interests.length > 0 &&
    !!p.goal;

  if (!isComplete) return;

  for (const quest of pending) {
    await completeQuest({
      attendeeId,
      questId: quest.id,
      partnerId: null,
      answeredCorrectly: null,
      pointsAwarded: quest.points_value ?? 0,
      leadConsent: false,
      consentTextVersion: null,
    });
  }
}
