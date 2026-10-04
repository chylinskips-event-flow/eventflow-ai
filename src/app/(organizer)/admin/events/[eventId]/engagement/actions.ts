"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PollStatus, QuestionStatus } from "@/lib/engagement-core";
import {
  insertPollFromForm,
  updatePollStatus,
  updateQuestionStatus,
} from "@/lib/engagement-mutations";

export type EngagementAdminState = { status: "idle" | "success" | "error"; message?: string };

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

  const { data: question } = await createAdminClient()
    .from("questions")
    .select("id, session_id, sessions!inner(event_id)")
    .eq("id", questionId)
    .eq("sessions.event_id" as never, eventId)
    .maybeSingle();
  if (!question) return { status: "error", message: "Pytanie nie istnieje." };

  const res = await updateQuestionStatus(questionId, question.session_id, status);
  if (!res.ok) return { status: "error", message: res.error };
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

  const { data: session } = await createAdminClient()
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!session) return { status: "error", message: "Sesja nie istnieje." };

  const res = await insertPollFromForm(eventId, sessionId, formData);
  if (!res.ok) return { status: "error", message: res.error };
  revalidate(eventId, sessionId);
  return { status: "success", message: "Ankieta utworzona. Otwórz ją, gdy będzie gotowa." };
}

export async function setPollStatus(
  eventId: string,
  pollId: string,
  status: PollStatus,
): Promise<EngagementAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const { data: poll } = await createAdminClient()
    .from("polls")
    .select("id, session_id")
    .eq("id", pollId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!poll?.session_id) return { status: "error", message: "Ankieta nie istnieje." };

  const res = await updatePollStatus(pollId, poll.session_id, status);
  if (!res.ok) return { status: "error", message: res.error };
  revalidate(eventId, poll.session_id);
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
