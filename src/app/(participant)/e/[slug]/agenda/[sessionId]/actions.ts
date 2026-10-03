"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getEventSessionById } from "@/lib/sessions";
import { hasFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEEDBACK_COMMENT_MAX_LENGTH,
  MAX_QUESTIONS_PER_ATTENDEE,
  canAskQuestions,
  canRateSession,
  parsePollOptions,
  validateQuestionContent,
  type EventStatus,
} from "@/lib/engagement-core";

export type EngagementActionState = { status: "idle" | "success" | "error"; message?: string };

const SESSION_EXPIRED = "Sesja wygasła. Zeskanuj swój kod QR ponownie, aby się zalogować.";
const UNAVAILABLE = "Ta funkcja nie jest dostępna dla tego wydarzenia.";

/**
 * Kontekst akcji: uczestnik WYŁĄCZNIE z cookie (nigdy z parametru), sesja musi należeć
 * do eventu uczestnika, a organizator musi mieć funkcję live_qa w planie.
 */
async function participantContext(slug: string, sessionId: string) {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) return { error: SESSION_EXPIRED } as const;
  const event = await getEventBySlugForRegistration(slug);
  if (!event || event.id !== attendee.event_id) return { error: SESSION_EXPIRED } as const;
  const session = await getEventSessionById(event.id, sessionId);
  if (!session) return { error: "Sesja nie istnieje." } as const;
  if (!(await hasFeature(event.organization_id, "live_qa"))) return { error: UNAVAILABLE } as const;
  return { attendee, event, session } as const;
}

function revalidateSession(slug: string, sessionId: string) {
  revalidatePath(`/e/${slug}/agenda/${sessionId}`);
}

export async function askQuestion(
  slug: string,
  sessionId: string,
  _prev: EngagementActionState,
  formData: FormData,
): Promise<EngagementActionState> {
  const ctx = await participantContext(slug, sessionId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!canAskQuestions(ctx.event.status as EventStatus)) {
    return { status: "error", message: "Pytania można zadawać przed wydarzeniem i w jego trakcie." };
  }

  const validated = validateQuestionContent(formData.get("content"));
  if (!validated.ok) return { status: "error", message: validated.error };

  const admin = createAdminClient();
  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("attendee_id", ctx.attendee.id);
  if ((count ?? 0) >= MAX_QUESTIONS_PER_ATTENDEE) {
    return { status: "error", message: `Możesz zadać najwyżej ${MAX_QUESTIONS_PER_ATTENDEE} pytań do jednej sesji.` };
  }

  const { error } = await admin.from("questions").insert({
    session_id: sessionId,
    attendee_id: ctx.attendee.id,
    content: validated.content,
    is_anonymous: formData.get("anonymous") === "on",
  });
  if (error) return { status: "error", message: "Nie udało się wysłać pytania. Spróbuj ponownie." };

  revalidateSession(slug, sessionId);
  return { status: "success", message: "Pytanie wysłane." };
}

export async function toggleQuestionVote(
  slug: string,
  sessionId: string,
  questionId: string,
): Promise<EngagementActionState> {
  const ctx = await participantContext(slug, sessionId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const admin = createAdminClient();
  const { data: question } = await admin
    .from("questions")
    .select("id, attendee_id, status")
    .eq("id", questionId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!question || question.status === "hidden") {
    return { status: "error", message: "Pytanie nie istnieje." };
  }
  if (question.attendee_id === ctx.attendee.id) {
    return { status: "error", message: "Nie możesz głosować na własne pytanie." };
  }

  const { data: existing } = await admin
    .from("question_votes")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("attendee_id", ctx.attendee.id)
    .maybeSingle();

  const { error } = existing
    ? await admin
        .from("question_votes")
        .delete()
        .eq("question_id", questionId)
        .eq("attendee_id", ctx.attendee.id)
    : await admin.from("question_votes").insert({ question_id: questionId, attendee_id: ctx.attendee.id });
  // 23505 = równoległy podwójny klik — głos już jest, stan poprawny.
  if (error && error.code !== "23505") {
    return { status: "error", message: "Nie udało się zapisać głosu." };
  }

  revalidateSession(slug, sessionId);
  return { status: "success" };
}

export async function answerPoll(
  slug: string,
  sessionId: string,
  pollId: string,
  optionId: string,
): Promise<EngagementActionState> {
  const ctx = await participantContext(slug, sessionId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const admin = createAdminClient();
  const { data: poll } = await admin
    .from("polls")
    .select("id, status, options")
    .eq("id", pollId)
    .eq("session_id", sessionId)
    .eq("event_id", ctx.event.id)
    .maybeSingle();
  if (!poll || poll.status !== "open") {
    return { status: "error", message: "Ankieta jest już zamknięta." };
  }
  if (!parsePollOptions(poll.options).some((o) => o.id === optionId)) {
    return { status: "error", message: "Nieprawidłowa odpowiedź." };
  }

  // Zmiana zdania dozwolona, dopóki ankieta jest otwarta.
  const { error } = await admin
    .from("poll_answers")
    .upsert(
      { poll_id: pollId, attendee_id: ctx.attendee.id, selected_option_id: optionId },
      { onConflict: "poll_id,attendee_id" },
    );
  if (error) return { status: "error", message: "Nie udało się zapisać odpowiedzi." };

  revalidateSession(slug, sessionId);
  return { status: "success" };
}

export async function rateSession(
  slug: string,
  sessionId: string,
  _prev: EngagementActionState,
  formData: FormData,
): Promise<EngagementActionState> {
  const ctx = await participantContext(slug, sessionId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!canRateSession(ctx.session, ctx.event.status as EventStatus, new Date())) {
    return { status: "error", message: "Sesję można ocenić po jej rozpoczęciu." };
  }

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: "error", message: "Wybierz ocenę od 1 do 5." };
  }
  const rawComment = formData.get("comment");
  const comment = typeof rawComment === "string" ? rawComment.trim() : "";
  if (comment.length > FEEDBACK_COMMENT_MAX_LENGTH) {
    return { status: "error", message: `Komentarz może mieć najwyżej ${FEEDBACK_COMMENT_MAX_LENGTH} znaków.` };
  }

  const { error } = await createAdminClient()
    .from("feedback")
    .upsert(
      { session_id: sessionId, attendee_id: ctx.attendee.id, rating, comment: comment || null },
      { onConflict: "session_id,attendee_id" },
    );
  if (error) return { status: "error", message: "Nie udało się zapisać oceny." };

  revalidateSession(slug, sessionId);
  return { status: "success", message: "Dziękujemy za ocenę!" };
}
