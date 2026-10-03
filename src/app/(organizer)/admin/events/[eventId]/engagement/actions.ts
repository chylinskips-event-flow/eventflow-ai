"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  POLL_QUESTION_MAX_LENGTH,
  buildPollOptions,
  type PollStatus,
  type QuestionStatus,
} from "@/lib/engagement-core";

export type EngagementAdminState = { status: "idle" | "success" | "error"; message?: string };

const QUESTION_STATUSES: QuestionStatus[] = ["pending", "selected", "answered", "hidden"];
const POLL_STATUSES: PollStatus[] = ["draft", "open", "closed"];

/** Właściciel eventu (RLS) + funkcja live_qa w planie. */
async function organizerContext(eventId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) return { error: "Brak dostępu do wydarzenia." } as const;
  const gate = await featureGate(event.organization_id, "live_qa");
  if (!gate.ok) return { error: gate.message } as const;
  return { event } as const;
}

function revalidate(eventId: string, sessionId: string) {
  revalidatePath(`/admin/events/${eventId}/engagement`);
  revalidatePath(`/admin/events/${eventId}/engagement/${sessionId}`);
}

/** Moderacja pytania: wyróżnij („teraz omawiane”), odpowiedziane, ukryj, przywróć. */
export async function setQuestionStatus(
  eventId: string,
  questionId: string,
  status: QuestionStatus,
): Promise<EngagementAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!QUESTION_STATUSES.includes(status)) return { status: "error", message: "Nieprawidłowy status." };

  const admin = createAdminClient();
  const { data: question } = await admin
    .from("questions")
    .select("id, session_id, sessions!inner(event_id)")
    .eq("id", questionId)
    .eq("sessions.event_id" as never, eventId)
    .maybeSingle();
  if (!question) return { status: "error", message: "Pytanie nie istnieje." };

  // Tylko jedno pytanie „teraz omawiane” na sesję — poprzednie wraca na listę.
  if (status === "selected") {
    await admin
      .from("questions")
      .update({ status: "pending" })
      .eq("session_id", question.session_id)
      .eq("status", "selected");
  }

  const { error } = await admin.from("questions").update({ status }).eq("id", questionId);
  if (error) return { status: "error", message: "Nie udało się zmienić statusu pytania." };

  revalidate(eventId, question.session_id);
  return { status: "success" };
}

export async function createPoll(
  eventId: string,
  sessionId: string,
  _prev: EngagementAdminState,
  formData: FormData,
): Promise<EngagementAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!session) return { status: "error", message: "Sesja nie istnieje." };

  const rawQuestion = formData.get("question");
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  if (!question) return { status: "error", message: "Wpisz pytanie ankiety." };
  if (question.length > POLL_QUESTION_MAX_LENGTH) {
    return { status: "error", message: `Pytanie może mieć najwyżej ${POLL_QUESTION_MAX_LENGTH} znaków.` };
  }

  const built = buildPollOptions(formData.getAll("option"), () => crypto.randomUUID().slice(0, 8));
  if (!built.ok) return { status: "error", message: built.error };

  const { error } = await admin.from("polls").insert({
    event_id: eventId,
    session_id: sessionId,
    question,
    options: built.options,
    status: "draft",
  });
  if (error) return { status: "error", message: "Nie udało się utworzyć ankiety." };

  revalidate(eventId, sessionId);
  return { status: "success", message: "Ankieta utworzona. Otwórz ją, gdy będzie gotowa." };
}

/** draft → open → closed (otwarcie zamyka inne otwarte ankiety tej sesji). */
export async function setPollStatus(
  eventId: string,
  pollId: string,
  status: PollStatus,
): Promise<EngagementAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!POLL_STATUSES.includes(status)) return { status: "error", message: "Nieprawidłowy status." };

  const admin = createAdminClient();
  const { data: poll } = await admin
    .from("polls")
    .select("id, session_id")
    .eq("id", pollId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!poll) return { status: "error", message: "Ankieta nie istnieje." };

  if (status === "open" && poll.session_id) {
    await admin
      .from("polls")
      .update({ status: "closed" })
      .eq("session_id", poll.session_id)
      .eq("status", "open")
      .neq("id", pollId);
  }

  const { error } = await admin.from("polls").update({ status }).eq("id", pollId);
  if (error) return { status: "error", message: "Nie udało się zmienić statusu ankiety." };

  if (poll.session_id) revalidate(eventId, poll.session_id);
  return { status: "success" };
}

export async function deletePoll(eventId: string, pollId: string): Promise<EngagementAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const admin = createAdminClient();
  const { data: poll } = await admin
    .from("polls")
    .select("id, session_id")
    .eq("id", pollId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!poll) return { status: "error", message: "Ankieta nie istnieje." };

  const { error } = await admin.from("polls").delete().eq("id", pollId);
  if (error) return { status: "error", message: "Nie udało się usunąć ankiety." };

  if (poll.session_id) revalidate(eventId, poll.session_id);
  return { status: "success" };
}
