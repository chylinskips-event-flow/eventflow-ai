"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerContext } from "@/lib/partner-portal";
import {
  getPartnerLeads,
  getPartnerQuestions,
  isPartnerLeadsEnabled,
  logLeadAudit,
} from "@/lib/partner-leads";
import { MAX_QUESTIONS_PER_PARTNER, PARTNER_DELETED_NOTE, validateQuestionInput, type PartnerLead } from "@/lib/partner-leads-core";
import type { PartnerActionState } from "./actions";

// #10 Faza B — akcje partnera: pytania przy stoisku (do akceptacji organizatora) i leady.
// Autoryzacja jak w Fazie A (getPartnerContext) + flaga PARTNER_LEADS_ENABLED.

const NO_ACCESS = "Brak dostępu — zaloguj się ponownie albo poproś organizatora o zaproszenie.";
const DISABLED = "Ta funkcja jest niedostępna.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate(partnerId: string, eventId: string) {
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath(`/admin/events/${eventId}/partners`);
  revalidatePath(`/admin/events/${eventId}/partners/${partnerId}`);
}

export async function addPartnerQuestion(
  partnerId: string,
  _prev: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  if (!isPartnerLeadsEnabled()) return { status: "error", message: DISABLED };
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };

  const parsed = validateQuestionInput((k) => formData.get(k));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const existing = await getPartnerQuestions(partnerId);
  // Odrzucone nie zajmują limitu — partner może je zastąpić nowymi.
  if (existing.filter((q) => q.status !== "rejected").length >= MAX_QUESTIONS_PER_PARTNER) {
    return { status: "error", message: `Możesz mieć najwyżej ${MAX_QUESTIONS_PER_PARTNER} pytania. Usuń jedno, aby dodać nowe.` };
  }

  const { data, error } = await createAdminClient()
    .from("partner_questions")
    .insert({
      partner_id: partnerId,
      event_id: ctx.event.id,
      position: Math.max(-1, ...existing.map((q) => q.position)) + 1,
      kind: parsed.value.kind,
      prompt: parsed.value.prompt,
      options: parsed.value.options,
    })
    .select("id")
    .single();
  if (error || !data) return { status: "error", message: "Nie udało się zapisać pytania." };

  await logLeadAudit({
    eventId: ctx.event.id,
    partnerId,
    actorType: "partner",
    actorUserId: ctx.user.id,
    action: "question_submitted",
    metadata: { question_id: data.id, prompt: parsed.value.prompt },
  });
  revalidate(partnerId, ctx.event.id);
  return { status: "success", message: "Pytanie wysłane do akceptacji organizatora." };
}

export async function deletePartnerQuestion(partnerId: string, questionId: string): Promise<PartnerActionState> {
  if (!isPartnerLeadsEnabled()) return { status: "error", message: DISABLED };
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };
  if (!UUID.test(questionId)) return { status: "error", message: "Pytanie nie istnieje." };

  // Usunięcie pytania kasowałoby (FK ON DELETE CASCADE) odpowiedzi uczestników, którzy już
  // wyrazili zgodę — pytanie z odpowiedziami tylko wycofujemy ze stoiska (status rejected).
  const admin = createAdminClient();
  const { count } = await admin
    .from("partner_question_answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId);

  const query =
    (count ?? 0) > 0
      ? admin
          .from("partner_questions")
          .update({ status: "rejected", review_note: PARTNER_DELETED_NOTE })
          .eq("id", questionId)
          .eq("partner_id", partnerId)
          .select("id, prompt")
      : admin.from("partner_questions").delete().eq("id", questionId).eq("partner_id", partnerId).select("id, prompt");
  const { data, error } = await query;
  if (error) return { status: "error", message: "Nie udało się usunąć pytania." };
  if (!data?.length) return { status: "error", message: "Pytanie nie istnieje." };

  await logLeadAudit({
    eventId: ctx.event.id,
    partnerId,
    actorType: "partner",
    actorUserId: ctx.user.id,
    action: "question_deleted",
    metadata: { question_id: questionId, prompt: data[0].prompt, kept_for_answers: (count ?? 0) > 0 },
  });
  revalidate(partnerId, ctx.event.id);
  return { status: "success" };
}

/** Leady na żądanie (przycisk „Pokaż leady”) — każdy podgląd trafia do audytu. */
export async function loadPartnerLeads(
  partnerId: string,
): Promise<{ status: "success"; leads: PartnerLead[] } | { status: "error"; message: string }> {
  if (!isPartnerLeadsEnabled()) return { status: "error", message: DISABLED };
  const ctx = await getPartnerContext(partnerId);
  if (!ctx) return { status: "error", message: NO_ACCESS };

  const leads = await getPartnerLeads(partnerId);
  const logged = await logLeadAudit({
    eventId: ctx.event.id,
    partnerId,
    actorType: "partner",
    actorUserId: ctx.user.id,
    action: "leads_viewed",
    metadata: { count: leads.length },
  });
  if (!logged) return { status: "error", message: "Nie udało się wczytać leadów. Spróbuj ponownie." };
  return { status: "success", leads };
}
