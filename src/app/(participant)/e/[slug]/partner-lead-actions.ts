"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getPartnerByTokenAndEventSlug } from "@/lib/partners";
import { getEventBySlugForRegistration } from "@/lib/events";
import {
  getActiveConsent,
  getPartnerQuestions,
  isPartnerLeadsEnabled,
  logLeadAudit,
  withdrawConsent,
} from "@/lib/partner-leads";
import { PARTNER_LEADS_CONSENT, validateAnswers } from "@/lib/partner-leads-core";

// #10 Faza B — akcje uczestnika. Tożsamość = sesja uczestnika eventu (cookie), partner po
// tokenie stoiska. Odpowiedzi zapisujemy WYŁĄCZNIE razem z wyraźną, osobną zgodą.

export type PartnerLeadState =
  | { status: "idle" }
  | { status: "success"; consentId: string }
  | { status: "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitPartnerLead(
  slug: string,
  partnerToken: string,
  _prev: PartnerLeadState,
  formData: FormData,
): Promise<PartnerLeadState> {
  if (!isPartnerLeadsEnabled()) return { status: "error", message: "Ta funkcja jest niedostępna." };

  const attendee = await getCurrentAttendee(slug);
  if (!attendee) return { status: "error", message: "Sesja wygasła. Wejdź przez swój link wejściowy." };
  const [partner, event] = await Promise.all([
    getPartnerByTokenAndEventSlug(partnerToken, slug),
    getEventBySlugForRegistration(slug),
  ]);
  if (!partner || !event || partner.event_id !== event.id) return { status: "error", message: "Nie znaleziono stoiska." };

  if (formData.get("partner_consent") !== "on") {
    return { status: "error", message: "Zaznacz zgodę, aby przekazać odpowiedzi partnerowi. Bez zgody nic nie zapisujemy." };
  }

  const questions = await getPartnerQuestions(partner.id, { approvedOnly: true });
  if (questions.length === 0) return { status: "error", message: "Partner nie ma aktywnych pytań." };
  const parsed = validateAnswers(questions, (k) => formData.get(k));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const existing = await getActiveConsent(partner.id, attendee.id);
  if (existing) return { status: "success", consentId: existing.id };

  const admin = createAdminClient();
  const { data: consent, error } = await admin
    .from("partner_lead_consents")
    .insert({
      partner_id: partner.id,
      event_id: event.id,
      attendee_id: attendee.id,
      consent_version: PARTNER_LEADS_CONSENT.version,
      consent_text: PARTNER_LEADS_CONSENT.text(partner.name, event.name),
    })
    .select("id")
    .single();
  if (error || !consent) {
    // Równoległe wysłanie → unikalny indeks aktywnej zgody.
    if (error?.code === "23505") {
      const again = await getActiveConsent(partner.id, attendee.id);
      if (again) return { status: "success", consentId: again.id };
    }
    console.error("[partner-leads] consent insert failed", JSON.stringify({ code: error?.code, message: error?.message }));
    return { status: "error", message: "Nie udało się zapisać. Spróbuj ponownie." };
  }

  if (parsed.answers.length > 0) {
    const { error: answersError } = await admin.from("partner_question_answers").insert(
      parsed.answers.map((a) => ({
        consent_id: consent.id,
        question_id: a.questionId,
        partner_id: partner.id,
        attendee_id: attendee.id,
        prompt: a.prompt,
        answer: a.answer,
      })),
    );
    if (answersError) {
      // Bez odpowiedzi zgoda traci sens dla uczestnika — wycofujemy ją i zgłaszamy błąd.
      console.error("[partner-leads] answers insert failed", JSON.stringify({ code: answersError.code, message: answersError.message }));
      await admin.from("partner_lead_consents").delete().eq("id", consent.id);
      return { status: "error", message: "Nie udało się zapisać odpowiedzi. Spróbuj ponownie." };
    }
  }

  await logLeadAudit({
    eventId: event.id,
    partnerId: partner.id,
    actorType: "attendee",
    attendeeId: attendee.id,
    action: "consent_given",
    metadata: { consent_version: PARTNER_LEADS_CONSENT.version, answers: parsed.answers.length },
  });
  return { status: "success", consentId: consent.id as string };
}

/** Wycofanie zgody (stoisko albo profil). Działa także przy wyłączonej fladze — prawo uczestnika. */
export async function withdrawPartnerConsent(slug: string, consentId: string): Promise<{ ok: boolean; message?: string }> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) return { ok: false, message: "Sesja wygasła. Wejdź przez swój link wejściowy." };
  if (!UUID.test(consentId)) return { ok: false, message: "Zgoda nie istnieje." };

  const res = await withdrawConsent(consentId, attendee.id);
  if (!res) return { ok: false, message: "Zgoda nie istnieje albo została już wycofana." };

  await logLeadAudit({
    eventId: res.eventId,
    partnerId: res.partnerId,
    actorType: "attendee",
    attendeeId: attendee.id,
    action: "consent_withdrawn",
  });
  revalidatePath(`/e/${slug}/profile`);
  return { ok: true };
}
