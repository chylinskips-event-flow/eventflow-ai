"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getPartnerByTokenAndEventSlug } from "@/lib/partners";
import { completeQuest } from "@/lib/gamification";
import { getCurrentBoothQuest } from "@/lib/booth-quest";
import { isPartnerLeadsEnabled } from "@/lib/partner-leads";
import { MAX_QUIZ_ATTEMPTS, QUIZ_COOLDOWN_MS, quizAttemptRejection } from "@/lib/booth-visit";

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

  // Grywalizacja wyłączona → zwykły check-in bez punktów (jak na stronie stoiska)
  const { data: eventRow } = await supabase
    .from("events")
    .select("gamification_enabled")
    .eq("id", partner.event_id)
    .maybeSingle();
  const gamificationEnabled = !!(eventRow as { gamification_enabled: boolean } | null)?.gamification_enabled;

  // Bieżący quest z pełnym config (correct_id / password zostają tu — server only)
  const quest = await getCurrentBoothQuest({
    eventId: partner.event_id,
    partnerId: partner.id,
    attendeeId: attendee.id,
    gamificationEnabled,
  });

  // Formularz był wyrenderowany dla konkretnego questa (ukryte quest_id; pusty = bez questa).
  // Jeśli bieżący quest się zmienił (np. inny niezaliczony quest partnera), nie oceniamy
  // odpowiedzi i nie zużywamy prób innego questa — uczestnik odświeża stronę.
  const renderedQuestId = ((formData.get("quest_id") as string | null) ?? "").trim();
  const currentQuestId = (quest?.id as string | undefined) ?? "";
  if (renderedQuestId !== currentQuestId) {
    return { status: "error", message: "Stoisko zmieniło zadanie — odśwież stronę." };
  }

  // Przy włączonej Fazie B (PARTNER_LEADS_ENABLED) lead powstaje WYŁĄCZNIE z osobnej zgody
  // w karcie „Pytania od {partner}” — stary checkbox jest ignorowany także po stronie serwera
  // (np. ręcznie dopisane pole w formularzu). Odwiedziny i punkty działają bez zmian.
  const leadConsent = !isPartnerLeadsEnabled() && formData.get("lead_consent") === "on";

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
    await supabase.from("event_analytics_log").insert({
      event_id: partner.event_id,
      attendee_id: attendee.id,
      action_type: "booth_checkin",
      metadata: { partner_id: partner.id, partner_name: partner.name, points_awarded: 0, quest_type: null },
    });
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
    const pts = result.ok ? result.pointsAwarded : 0;
    await supabase.from("event_analytics_log").insert({
      event_id: partner.event_id,
      attendee_id: attendee.id,
      action_type: "booth_checkin",
      metadata: { partner_id: partner.id, partner_name: partner.name, points_awarded: pts, quest_type: "booth_visit" },
    });
    if (!result.ok) {
      return { status: "success", pointsAwarded: 0, newLevel: attendee.level, levelUp: false };
    }
    return { status: "success", pointsAwarded: result.pointsAwarded, newLevel: result.newLevel, levelUp: result.levelUp };
  }

  // booth_quiz / booth_password — zarezerwuj próbę atomowo w bazie (limit prób i przerwa
  // sprawdzane w tym samym poleceniu, które zwiększa licznik), dopiero potem oceniaj.
  const { data: claimed, error: claimError } = await supabase.rpc("claim_quiz_attempt", {
    p_quest_id: quest.id,
    p_attendee_id: attendee.id,
    p_max_attempts: MAX_QUIZ_ATTEMPTS,
    p_cooldown_seconds: QUIZ_COOLDOWN_MS / 1000,
  });
  if (claimError) {
    return { status: "error", message: "Nie udało się zapisać odpowiedzi. Spróbuj ponownie." };
  }

  if (typeof claimed !== "number") {
    // Próba odrzucona — ustal powód (wyczerpany limit albo trwająca przerwa)
    const { data: attemptsRow } = await supabase
      .from("quiz_attempts")
      .select("attempts, last_attempt_at")
      .eq("quest_id", quest.id)
      .eq("attendee_id", attendee.id)
      .maybeSingle();
    return quizAttemptRejection(
      attemptsRow as { attempts: number; last_attempt_at: string | null } | null,
      Date.now(),
    );
  }

  // claimed = numer zarezerwowanej próby (1 = pierwsza); attemptsUsed = próby przed nią
  const attemptsUsed = claimed - 1;

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

  const newAttemptsUsed = claimed;

  if (!isCorrect) {
    if (newAttemptsUsed >= MAX_QUIZ_ATTEMPTS) {
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
      await supabase.from("event_analytics_log").insert({
        event_id: partner.event_id,
        attendee_id: attendee.id,
        action_type: "booth_checkin",
        metadata: { partner_id: partner.id, partner_name: partner.name, points_awarded: 0, quest_type: questType, answered_correctly: false },
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

  const pts = result.ok ? result.pointsAwarded : 0;
  await supabase.from("event_analytics_log").insert({
    event_id: partner.event_id,
    attendee_id: attendee.id,
    action_type: "booth_checkin",
    metadata: { partner_id: partner.id, partner_name: partner.name, points_awarded: pts, quest_type: questType, answered_correctly: true },
  });

  if (!result.ok) {
    return { status: "success", pointsAwarded: 0, newLevel: attendee.level, levelUp: false };
  }
  return { status: "success", pointsAwarded: result.pointsAwarded, newLevel: result.newLevel, levelUp: result.levelUp };
}
