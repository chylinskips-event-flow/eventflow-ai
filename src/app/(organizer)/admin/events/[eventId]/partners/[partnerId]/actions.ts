"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPartnerLeadsEnabled, logLeadAudit } from "@/lib/partner-leads";
import { getOrigin } from "@/lib/request-origin";
import { sendPartnerInviteEmail } from "@/lib/email/partner-invite";
import { INVITE_TTL_DAYS, REVIEW_NOTE_MAX_LENGTH, normalizeEmail } from "@/lib/partner-portal-core";
import { PARTNER_DELETED_NOTE } from "@/lib/partner-leads-core";

export type PortalAdminState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Link zaproszenia do skopiowania (gdy e-mail nie wyszedł albo dla wygody organizatora). */
  inviteUrl?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Właściciel eventu (RLS) + partner_portal w planie + partner należy do eventu. */
async function organizerContext(eventId: string, partnerId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) return { error: "Brak dostępu do wydarzenia." } as const;
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return { error: gate.message } as const;
  if (!UUID.test(partnerId)) return { error: "Partner nie istnieje." } as const;
  const { data: partner } = await createAdminClient()
    .from("partners")
    .select("id, name")
    .eq("id", partnerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!partner) return { error: "Partner nie istnieje." } as const;
  return { event, partner } as const;
}

function revalidate(eventId: string, partnerId: string) {
  revalidatePath(`/admin/events/${eventId}/partners`);
  revalidatePath(`/admin/events/${eventId}/partners/${partnerId}`);
}

function inviteExpiry() {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ── Dostępy ────────────────────────────────────────────────────────────────

/**
 * Zaproszenie osoby od partnera. Ten sam e-mail z niewykorzystanym zaproszeniem → nowy
 * token i termin (ponowna wysyłka); z aktywnym dostępem → komunikat, bez zmian.
 */
export async function invitePartnerUser(
  eventId: string,
  partnerId: string,
  _prev: PortalAdminState,
  formData: FormData,
): Promise<PortalAdminState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const email = normalizeEmail(formData.get("email"));
  if (!email) return { status: "error", message: "Podaj poprawny adres e-mail." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("partner_access")
    .select("id, user_id")
    .eq("partner_id", partnerId)
    .eq("email", email)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing?.user_id) {
    return { status: "error", message: "Ta osoba ma już aktywny dostęp do panelu." };
  }

  const token = crypto.randomUUID();
  const { error } = existing
    ? await admin
        .from("partner_access")
        .update({ invite_token: token, invite_expires_at: inviteExpiry(), invited_at: new Date().toISOString() })
        .eq("id", existing.id)
    : await admin.from("partner_access").insert({
        partner_id: partnerId,
        event_id: eventId,
        email,
        invite_token: token,
        invite_expires_at: inviteExpiry(),
      });
  if (error) {
    console.error("[partner-portal] invite failed", JSON.stringify({ code: error.code, message: error.message }));
    return { status: "error", message: "Nie udało się utworzyć zaproszenia." };
  }

  const inviteUrl = `${getOrigin(await headers())}/partner/invite/${token}`;
  revalidate(eventId, partnerId);
  try {
    await sendPartnerInviteEmail({ to: email, partnerName: ctx.partner.name, eventName: ctx.event.name, inviteUrl });
  } catch (e) {
    console.error("[partner-portal] invite email failed", e instanceof Error ? e.message : e);
    return {
      status: "success",
      message: "Zaproszenie utworzone, ale e-mail nie został wysłany. Przekaż link ręcznie:",
      inviteUrl,
    };
  }
  return { status: "success", message: `Zaproszenie wysłane na ${email}.`, inviteUrl };
}

/** Unieważnienie odcina dostęp natychmiast (sprawdzany przy każdym żądaniu partnera). */
export async function revokePartnerAccess(
  eventId: string,
  partnerId: string,
  accessId: string,
): Promise<PortalAdminState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(accessId)) return { status: "error", message: "Dostęp nie istnieje." };

  const { data, error } = await createAdminClient()
    .from("partner_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", accessId)
    .eq("partner_id", partnerId)
    .is("revoked_at", null)
    .select("id");
  if (error) return { status: "error", message: "Nie udało się unieważnić dostępu." };
  if (!data?.length) return { status: "error", message: "Dostęp nie istnieje albo jest już unieważniony." };

  revalidate(eventId, partnerId);
  return { status: "success" };
}

// ── Akceptacja treści ──────────────────────────────────────────────────────

const DRAFT_CHANGED = "Partner zmienił wizytówkę — odśwież stronę i sprawdź nową wersję.";

/** Ta sama chwila wysłania szkicu (porównanie niezależne od formatu zapisu daty). */
function sameSubmission(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  return !Number.isNaN(ta) && ta === Date.parse(b);
}

/**
 * Zatwierdzenie szkicu: kopiuje pola do public.partners (strona eventu) i usuwa szkic.
 * `seenSubmittedAt` — submitted_at wersji, którą organizator oglądał. Jeśli partner wysłał
 * w międzyczasie nową wersję, odmawiamy (publikujemy tylko to, co organizator widział).
 */
export async function approvePartnerDraft(
  eventId: string,
  partnerId: string,
  seenSubmittedAt: string,
): Promise<PortalAdminState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("partner_profile_drafts")
    .select("name, logo_url, description, website_url, offer, social_links, status, submitted_at")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!draft || draft.status !== "pending") {
    return { status: "error", message: "Brak zmian do akceptacji." };
  }
  if (!sameSubmission(draft.submitted_at as string | null, seenSubmittedAt)) {
    return { status: "error", message: DRAFT_CHANGED };
  }

  const { error } = await admin
    .from("partners")
    .update({
      name: draft.name,
      logo_url: draft.logo_url,
      description: draft.description,
      website_url: draft.website_url,
      offer: draft.offer,
      social_links: draft.social_links,
    })
    .eq("id", partnerId)
    .eq("event_id", eventId);
  if (error) return { status: "error", message: "Nie udało się opublikować zmian." };

  // Usuwamy tylko zatwierdzoną wersję — nowszy szkic wysłany w międzyczasie zostaje do akceptacji.
  await admin
    .from("partner_profile_drafts")
    .delete()
    .eq("partner_id", partnerId)
    .eq("submitted_at", draft.submitted_at as string);
  revalidate(eventId, partnerId);
  return { status: "success", message: "Zmiany opublikowane na stronie wydarzenia." };
}

export async function rejectPartnerDraft(
  eventId: string,
  partnerId: string,
  _prev: PortalAdminState,
  formData: FormData,
): Promise<PortalAdminState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const raw = formData.get("note");
  const note = typeof raw === "string" ? raw.trim().slice(0, REVIEW_NOTE_MAX_LENGTH) : "";
  // Odrzucamy tylko wersję, którą organizator oglądał — nowszy szkic zostaje do akceptacji.
  const rawSeen = formData.get("seen_submitted_at");
  const seen = typeof rawSeen === "string" ? rawSeen.trim() : "";
  if (!seen || seen.length > 64 || Number.isNaN(Date.parse(seen))) {
    return { status: "error", message: DRAFT_CHANGED };
  }
  const { data, error } = await createAdminClient()
    .from("partner_profile_drafts")
    .update({ status: "rejected", review_note: note || null, reviewed_at: new Date().toISOString() })
    .eq("partner_id", partnerId)
    .eq("status", "pending")
    .eq("submitted_at", seen)
    .select("partner_id");
  if (error) return { status: "error", message: "Nie udało się zapisać decyzji." };
  if (!data?.length) return { status: "error", message: DRAFT_CHANGED };

  revalidate(eventId, partnerId);
  return { status: "success", message: "Zmiany odrzucone — partner zobaczy uwagę w panelu." };
}

export async function reviewPartnerMaterial(
  eventId: string,
  partnerId: string,
  materialId: string,
  decision: "approved" | "rejected",
): Promise<PortalAdminState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(materialId) || (decision !== "approved" && decision !== "rejected")) {
    return { status: "error", message: "Materiał nie istnieje." };
  }

  const { data, error } = await createAdminClient()
    .from("partner_materials")
    .update({ status: decision, reviewed_at: new Date().toISOString() })
    .eq("id", materialId)
    .eq("partner_id", partnerId)
    .select("id");
  if (error) return { status: "error", message: "Nie udało się zapisać decyzji." };
  if (!data?.length) return { status: "error", message: "Materiał nie istnieje." };

  revalidate(eventId, partnerId);
  return { status: "success" };
}

// ── #10 Faza B: pytania przy stoisku ───────────────────────────────────────

const QUESTION_CHANGED = "Pytanie zmieniło się w międzyczasie — odśwież stronę.";

/**
 * Decyzja organizatora o pytaniu partnera. `seenStatus` i `seenUpdatedAt` — status i wersja
 * (updated_at) widoczne na stronie organizatora;
 * jeśli pytanie zmieniło się w międzyczasie (np. partner je wycofał), decyzja nie jest zapisywana.
 * Pytania wycofanego przez partnera nie da się ponownie zaakceptować.
 */
export async function reviewPartnerQuestion(
  eventId: string,
  partnerId: string,
  questionId: string,
  decision: "approved" | "rejected",
  note?: string,
  seenStatus?: "pending" | "approved" | "rejected",
  seenUpdatedAt?: string,
): Promise<PortalAdminState> {
  if (!isPartnerLeadsEnabled()) return { status: "error", message: "Ta funkcja jest niedostępna." };
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(questionId) || (decision !== "approved" && decision !== "rejected")) {
    return { status: "error", message: "Pytanie nie istnieje." };
  }
  const reviewNote = decision === "rejected" ? (note ?? "").trim().slice(0, REVIEW_NOTE_MAX_LENGTH) || null : null;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("partner_questions")
    .select("status, review_note, updated_at")
    .eq("id", questionId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!current) return { status: "error", message: "Pytanie nie istnieje — odśwież stronę." };
  if (current.status === "rejected" && current.review_note === PARTNER_DELETED_NOTE) {
    return { status: "error", message: "Partner wycofał to pytanie — odśwież stronę." };
  }
  if (seenStatus && current.status !== seenStatus) {
    return { status: "error", message: QUESTION_CHANGED };
  }
  // Wersja ze strony: wykrywa też zmianę treści, po której status wrócił do tej samej wartości.
  const seen = (seenUpdatedAt ?? "").trim();
  const seenTime = Date.parse(seen);
  if (!seen || Number.isNaN(seenTime) || seenTime !== Date.parse(current.updated_at as string)) {
    return { status: "error", message: QUESTION_CHANGED };
  }

  // Zapis tylko, gdy wiersz nie zmienił się od wersji widzianej na stronie.
  const { data, error } = await admin
    .from("partner_questions")
    .update({ status: decision, review_note: reviewNote, reviewed_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("partner_id", partnerId)
    .eq("status", current.status as string)
    .eq("updated_at", seen)
    .select("id, prompt");
  if (error) return { status: "error", message: "Nie udało się zapisać decyzji." };
  if (!data?.length) return { status: "error", message: QUESTION_CHANGED };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await logLeadAudit({
    eventId,
    partnerId,
    actorType: "organizer",
    actorUserId: user?.id ?? null,
    action: decision === "approved" ? "question_approved" : "question_rejected",
    metadata: { question_id: questionId, prompt: data[0].prompt, ...(reviewNote ? { note: reviewNote } : {}) },
  });
  revalidate(eventId, partnerId);
  return { status: "success", message: decision === "approved" ? "Pytanie zaakceptowane — pojawi się przy stoisku." : "Pytanie odrzucone." };
}
