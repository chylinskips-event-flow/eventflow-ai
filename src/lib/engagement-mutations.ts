// Wspólne zapisy Q&A / ankiet dla organizatora i prowadzącego (service_role).
// Wywoływać WYŁĄCZNIE po autoryzacji i po sprawdzeniu, że obiekt należy do eventu
// (i sali — u prowadzącego). Same funkcje nie autoryzują.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  POLL_QUESTION_MAX_LENGTH,
  buildPollOptions,
  type PollStatus,
  type QuestionStatus,
} from "@/lib/engagement-core";

export const QUESTION_STATUSES: QuestionStatus[] = ["pending", "selected", "answered", "hidden"];
export const POLL_STATUSES: PollStatus[] = ["draft", "open", "closed"];

export type MutationResult = { ok: true } | { ok: false; error: string };

/** Zmiana statusu pytania; „teraz omawiane” może być tylko jedno na sesję. */
export async function updateQuestionStatus(
  questionId: string,
  sessionId: string,
  status: QuestionStatus,
): Promise<MutationResult> {
  if (!QUESTION_STATUSES.includes(status)) return { ok: false, error: "Nieprawidłowy status." };
  const admin = createAdminClient();
  if (status === "selected") {
    await admin
      .from("questions")
      .update({ status: "pending" })
      .eq("session_id", sessionId)
      .eq("status", "selected");
  }
  const { error } = await admin
    .from("questions")
    .update({ status })
    .eq("id", questionId)
    .eq("session_id", sessionId);
  return error ? { ok: false, error: "Nie udało się zmienić statusu pytania." } : { ok: true };
}

/** Nowa ankieta (szkic) z formularza: pole `question` i wiele pól `option`. */
export async function insertPollFromForm(
  eventId: string,
  sessionId: string,
  formData: FormData,
  initialStatus: "draft" | "open" = "draft",
): Promise<MutationResult> {
  const rawQuestion = formData.get("question");
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  if (!question) return { ok: false, error: "Wpisz pytanie ankiety." };
  if (question.length > POLL_QUESTION_MAX_LENGTH) {
    return { ok: false, error: `Pytanie może mieć najwyżej ${POLL_QUESTION_MAX_LENGTH} znaków.` };
  }
  const built = buildPollOptions(formData.getAll("option"), () => crypto.randomUUID().slice(0, 8));
  if (!built.ok) return { ok: false, error: built.error };

  const admin = createAdminClient();
  if (initialStatus === "open") {
    await admin.from("polls").update({ status: "closed" }).eq("session_id", sessionId).eq("status", "open");
  }
  const { error } = await admin.from("polls").insert({
    event_id: eventId,
    session_id: sessionId,
    question,
    options: built.options,
    status: initialStatus,
  });
  return error ? { ok: false, error: "Nie udało się utworzyć ankiety." } : { ok: true };
}

/** draft → open → closed; otwarcie zamyka inne otwarte ankiety tej sesji. */
export async function updatePollStatus(
  pollId: string,
  sessionId: string,
  status: PollStatus,
): Promise<MutationResult> {
  if (!POLL_STATUSES.includes(status)) return { ok: false, error: "Nieprawidłowy status." };
  const admin = createAdminClient();
  if (status === "open") {
    await admin
      .from("polls")
      .update({ status: "closed" })
      .eq("session_id", sessionId)
      .eq("status", "open")
      .neq("id", pollId);
  }
  const { error } = await admin
    .from("polls")
    .update({ status })
    .eq("id", pollId)
    .eq("session_id", sessionId);
  return error ? { ok: false, error: "Nie udało się zmienić statusu ankiety." } : { ok: true };
}
