"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionInScope, resolveModeratorLink } from "@/lib/moderator";
import { alertInLinkScope } from "@/lib/moderator-core";
import type { PollStatus, QuestionStatus } from "@/lib/engagement-core";
import { insertPollFromForm, updatePollStatus, updateQuestionStatus } from "@/lib/engagement-mutations";

// Akcje prowadzącego. Autoryzacja = ważny token linku (resolveModeratorLink) + każdy
// obiekt musi należeć do eventu linku i do jego sali (link z salą nie steruje inną salą).

export type ModeratorActionState = { status: "idle" | "success" | "error"; message?: string };

const NO_ACCESS = "Link wygasł albo został unieważniony. Poproś organizatora o nowy.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function moderatorSetQuestionStatus(
  token: string,
  questionId: string,
  status: QuestionStatus,
): Promise<ModeratorActionState> {
  const ctx = await resolveModeratorLink(token);
  if (!ctx) return { status: "error", message: NO_ACCESS };
  if (!UUID.test(questionId)) return { status: "error", message: "Pytanie nie istnieje." };

  const { data: question } = await createAdminClient()
    .from("questions")
    .select("id, session_id")
    .eq("id", questionId)
    .maybeSingle();
  if (!question || !(await getSessionInScope(ctx, question.session_id))) {
    return { status: "error", message: "Pytanie nie istnieje." };
  }

  const res = await updateQuestionStatus(questionId, question.session_id, status);
  if (!res.ok) return { status: "error", message: res.error };
  revalidatePath(`/mod/${token}`);
  return { status: "success" };
}

/** Prowadzący tworzy ankietę w trakcie sesji — domyślnie od razu otwartą. */
export async function moderatorCreatePoll(
  token: string,
  sessionId: string,
  _prev: ModeratorActionState,
  formData: FormData,
): Promise<ModeratorActionState> {
  const ctx = await resolveModeratorLink(token);
  if (!ctx) return { status: "error", message: NO_ACCESS };
  if (!(await getSessionInScope(ctx, sessionId))) return { status: "error", message: "Sesja nie istnieje." };

  const openNow = formData.get("open_now") === "on";
  const res = await insertPollFromForm(ctx.event.id, sessionId, formData, openNow ? "open" : "draft");
  if (!res.ok) return { status: "error", message: res.error };
  revalidatePath(`/mod/${token}`);
  return { status: "success", message: openNow ? "Ankieta otwarta." : "Ankieta zapisana jako szkic." };
}

export async function moderatorSetPollStatus(
  token: string,
  pollId: string,
  status: PollStatus,
): Promise<ModeratorActionState> {
  const ctx = await resolveModeratorLink(token);
  if (!ctx) return { status: "error", message: NO_ACCESS };
  if (!UUID.test(pollId)) return { status: "error", message: "Ankieta nie istnieje." };

  const { data: poll } = await createAdminClient()
    .from("polls")
    .select("id, session_id")
    .eq("id", pollId)
    .eq("event_id", ctx.event.id)
    .maybeSingle();
  if (!poll?.session_id || !(await getSessionInScope(ctx, poll.session_id))) {
    return { status: "error", message: "Ankieta nie istnieje." };
  }

  const res = await updatePollStatus(pollId, poll.session_id, status);
  if (!res.ok) return { status: "error", message: res.error };
  revalidatePath(`/mod/${token}`);
  return { status: "success" };
}

/** Odhaczenie komunikatu jako ogłoszonego (albo cofnięcie). */
export async function moderatorSetAlertAnnounced(
  token: string,
  alertId: string,
  announced: boolean,
): Promise<ModeratorActionState> {
  const ctx = await resolveModeratorLink(token);
  if (!ctx) return { status: "error", message: NO_ACCESS };
  if (!UUID.test(alertId)) return { status: "error", message: "Komunikat nie istnieje." };

  const admin = createAdminClient();
  const { data: alert } = await admin
    .from("event_alerts")
    .select("id, room")
    .eq("id", alertId)
    .eq("event_id", ctx.event.id)
    .maybeSingle();
  if (!alert || !alertInLinkScope(ctx.link.room, alert.room)) {
    return { status: "error", message: "Komunikat nie istnieje." };
  }

  const { error } = await admin
    .from("event_alerts")
    .update(
      announced
        ? { announced_at: new Date().toISOString(), announced_via: ctx.link.id }
        : { announced_at: null, announced_via: null },
    )
    .eq("id", alertId);
  if (error) return { status: "error", message: "Nie udało się zapisać." };
  revalidatePath(`/mod/${token}`);
  return { status: "success" };
}
