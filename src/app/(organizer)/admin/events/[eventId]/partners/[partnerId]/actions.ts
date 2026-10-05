"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import { sendPartnerInviteEmail } from "@/lib/email/partner-invite";
import { INVITE_TTL_DAYS, REVIEW_NOTE_MAX_LENGTH, normalizeEmail } from "@/lib/partner-portal-core";

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

/** Zatwierdzenie szkicu: kopiuje pola do public.partners (strona eventu) i usuwa szkic. */
export async function approvePartnerDraft(eventId: string, partnerId: string): Promise<PortalAdminState> {
  const ctx = await organizerContext(eventId, partnerId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("partner_profile_drafts")
    .select("name, logo_url, description, website_url, offer, social_links, status")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!draft || draft.status !== "pending") {
    return { status: "error", message: "Brak zmian do akceptacji." };
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

  await admin.from("partner_profile_drafts").delete().eq("partner_id", partnerId);
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
  const { data, error } = await createAdminClient()
    .from("partner_profile_drafts")
    .update({ status: "rejected", review_note: note || null, reviewed_at: new Date().toISOString() })
    .eq("partner_id", partnerId)
    .eq("status", "pending")
    .select("partner_id");
  if (error) return { status: "error", message: "Nie udało się zapisać decyzji." };
  if (!data?.length) return { status: "error", message: "Brak zmian do akceptacji." };

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
