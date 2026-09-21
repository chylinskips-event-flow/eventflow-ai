"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getPartnerByTokenAndEventSlug } from "@/lib/partners";
import { completeQuest } from "@/lib/gamification";

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minut
const CONSENT_TEXT_VERSION = "v1-2026-09";

export type BoothActionState =
  | { status: "idle" }
  | { status: "success"; pointsAwarded: number; newLevel: string; levelUp: boolean }
  | { status: "wrong_answer"; attemptsUsed: number }
  | { status: "no_attempts" }
  | { status: "error"; message: string };

export async function submitBoothVisit(
  slug: string,
  partnerToken: string,
  _prevState: BoothActionState,
  formData: FormData,
): Promise<BoothActionState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: "Sesja wygasła. Wejdź przez swój link wejściowy." };
  }

  const partner = await getPartnerByTokenAndEventSlug(partnerToken, slug);
  if (!partner) {
    return { status: "error", message: "Nie znaleziono stoiska." };
  }

  const supabase = createAdminClient();

  // Pobierz questa z pełnym config (correct_id / password zostają tu — server only)
  const { data: quest } = await supabase
    .from("quests")
    .select("id, type, title, points_value, config")
    .eq("partner_id", partner.id)
    .eq("event_id", partner.event_id)
    .eq("is_active", true)
    .maybeSingle();

  const leadConsent = formData.get("lead_consent") === "on";

  // Brak questa → prosty check-in bez punktów
  if (!quest) {
    await supabase
      .from("checkins")
      .upsert(
        { attendee_id: attendee.id, partner_id: partner.id },
        { onConflict: "attendee_id,partner_id", ignoreDuplicates: true },
      );
    if (leadConsent) {
      await supabase
        .from("checkins")
        .update({ lead_consent_given: true })
        .eq("attendee_id", attendee.id)
        .eq("partner_id", partner.id);
    }
    return { status: "success", pointsAwarded: 0, newLevel: attendee.level, levelUp: false };
  }

  const questType = quest.type as string;

  // booth_visit — bez odpowiedzi, zalicz od razu
  if (questType === "booth_visit") {
    const result = await completeQuest({
      attendeeId: attendee.id,
      questId: quest.id as string,
      partnerId: partner.id,
      answeredCorrectly: null,
      pointsAwarded: (quest.points_value as number) ?? 0,
      leadConsent,
      consentTextVersion: leadConsent ? CONSENT_TEXT_VERSION : null,
    });
    if (!result.ok) {
      return { status: "success", pointsAwarded: 0, newLevel: attendee.level, levelUp: false };
    }
    return { status: "success", pointsAwarded: result.pointsAwarded, newLevel: result.newLevel, levelUp: result.levelUp };
  }

  // booth_quiz / booth_password — sprawdź próby i cooldown
  const { data: attemptsRow } = await supabase
    .from("quiz_attempts")
    .select("attempts, last_attempt_at")
    .eq("quest_id", quest.id)
    .eq("attendee_id", attendee.id)
    .maybeSingle();

  const attemptsUsed = (attemptsRow as { attempts: number } | null)?.attempts ?? 0;

  if (attemptsUsed >= 2) {
    return { status: "no_attempts" };
  }

  // Cooldown: po pierwszej nieudanej próbie, odczekaj 10 min
  if (attemptsUsed === 1) {
    const lastAt = (attemptsRow as { last_attempt_at: string | null } | null)?.last_attempt_at;
    if (lastAt) {
      const elapsed = Date.now() - new Date(lastAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const minutesLeft = Math.ceil((COOLDOWN_MS - elapsed) / 60_000);
        return {
          status: "error",
          message: `Porozmawiaj z zespołem stoiska i spróbuj ponownie za ${minutesLeft} min.`,
        };
      }
    }
  }

  // Oceń odpowiedź — WYŁĄCZNIE server-side, correct_id/password nie wychodzą z akcji
  let isCorrect = false;
  const config = quest.config as Record<string, unknown> | null;

  if (questType === "booth_quiz" && config) {
    const correctId = config.correct_id as string;
    const answerId = (formData.get("answer_id") as string) ?? "";
    isCorrect = correctId === answerId;
  } else if (questType === "booth_password" && config) {
    const password = config.password as string;
    const submitted = ((formData.get("password") as string) ?? "").trim().toLowerCase();
    isCorrect = password.toLowerCase() === submitted;
  }

  // Zainkrementuj próby (UPSERT — unique quest_id+attendee_id)
  await supabase.from("quiz_attempts").upsert(
    {
      quest_id: quest.id,
      attendee_id: attendee.id,
      attempts: attemptsUsed + 1,
      last_attempt_at: new Date().toISOString(),
    },
    { onConflict: "quest_id,attendee_id" },
  );

  const newAttemptsUsed = attemptsUsed + 1;

  if (!isCorrect) {
    if (newAttemptsUsed >= 2) {
      // Wyczerpano próby — zapisz ukończenie z 0 punktami
      await completeQuest({
        attendeeId: attendee.id,
        questId: quest.id as string,
        partnerId: partner.id,
        answeredCorrectly: false,
        pointsAwarded: 0,
        leadConsent,
        consentTextVersion: leadConsent ? CONSENT_TEXT_VERSION : null,
      });
      return { status: "no_attempts" };
    }
    return { status: "wrong_answer", attemptsUsed: newAttemptsUsed };
  }

  // Poprawna odpowiedź — punkty zależą od numeru próby
  const fullPoints = (quest.points_value as number) ?? 0;
  const pointsAwarded = attemptsUsed === 0 ? fullPoints : Math.floor(fullPoints / 2);

  const result = await completeQuest({
    attendeeId: attendee.id,
    questId: quest.id as string,
    partnerId: partner.id,
    answeredCorrectly: true,
    pointsAwarded,
    leadConsent,
    consentTextVersion: leadConsent ? CONSENT_TEXT_VERSION : null,
  });

  if (!result.ok) {
    return { status: "success", pointsAwarded: 0, newLevel: attendee.level, levelUp: false };
  }
  return { status: "success", pointsAwarded: result.pointsAwarded, newLevel: result.newLevel, levelUp: result.levelUp };
}
