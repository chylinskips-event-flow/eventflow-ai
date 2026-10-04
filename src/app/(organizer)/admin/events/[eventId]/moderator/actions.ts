"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeRoom,
  validateAlertContent,
  validateLinkLabel,
  validateNoteContent,
} from "@/lib/moderator-core";

export type ModeratorAdminState = { status: "idle" | "success" | "error"; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Właściciel eventu (RLS) + funkcja live_qa w planie. */
async function organizerContext(eventId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) return { error: "Brak dostępu do wydarzenia." } as const;
  const gate = await featureGate(event.organization_id, "live_qa");
  if (!gate.ok) return { error: gate.message } as const;
  return { event } as const;
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/moderator`);
}

// ── Linki prowadzących ─────────────────────────────────────────────────────

export async function createModeratorLink(
  eventId: string,
  _prev: ModeratorAdminState,
  formData: FormData,
): Promise<ModeratorAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const label = validateLinkLabel(formData.get("label"));
  if (!label.ok) return { status: "error", message: label.error };

  const { error } = await createAdminClient().from("moderator_links").insert({
    event_id: eventId,
    label: label.value,
    room: normalizeRoom(formData.get("room")),
  });
  if (error) return { status: "error", message: "Nie udało się utworzyć linku." };

  revalidate(eventId);
  return { status: "success", message: "Link utworzony." };
}

/** Unieważnienie jest nieodwracalne — w razie potrzeby tworzy się nowy link. */
export async function revokeModeratorLink(eventId: string, linkId: string): Promise<ModeratorAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(linkId)) return { status: "error", message: "Link nie istnieje." };

  const { data, error } = await createAdminClient()
    .from("moderator_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .select("id");
  if (error) return { status: "error", message: "Nie udało się unieważnić linku." };
  if (!data?.length) return { status: "error", message: "Link nie istnieje albo jest już unieważniony." };

  revalidate(eventId);
  return { status: "success" };
}

// ── Komunikaty do ogłoszenia ───────────────────────────────────────────────

export async function createAlert(
  eventId: string,
  _prev: ModeratorAdminState,
  formData: FormData,
): Promise<ModeratorAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const content = validateAlertContent(formData.get("content"));
  if (!content.ok) return { status: "error", message: content.error };

  const { error } = await createAdminClient().from("event_alerts").insert({
    event_id: eventId,
    content: content.value,
    room: normalizeRoom(formData.get("room")),
    is_important: formData.get("important") === "on",
  });
  if (error) return { status: "error", message: "Nie udało się dodać komunikatu." };

  revalidate(eventId);
  return { status: "success", message: "Komunikat dodany — prowadzący zobaczą go w panelu." };
}

export async function deleteAlert(eventId: string, alertId: string): Promise<ModeratorAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!UUID.test(alertId)) return { status: "error", message: "Komunikat nie istnieje." };

  const { error } = await createAdminClient()
    .from("event_alerts")
    .delete()
    .eq("id", alertId)
    .eq("event_id", eventId);
  if (error) return { status: "error", message: "Nie udało się usunąć komunikatu." };

  revalidate(eventId);
  return { status: "success" };
}

// ── Scenariusz i notatki do sesji ──────────────────────────────────────────

/** sessionId null = scenariusz całego wydarzenia. Pusta treść usuwa notatkę. */
export async function saveModeratorNote(
  eventId: string,
  sessionId: string | null,
  _prev: ModeratorAdminState,
  formData: FormData,
): Promise<ModeratorAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const content = validateNoteContent(formData.get("content"));
  if (!content.ok) return { status: "error", message: content.error };

  const admin = createAdminClient();
  if (sessionId !== null) {
    if (!UUID.test(sessionId)) return { status: "error", message: "Sesja nie istnieje." };
    const { data: session } = await admin
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!session) return { status: "error", message: "Sesja nie istnieje." };
  }

  // Indeksy unikalne są częściowe (session_id NULL / NOT NULL), więc zamiast upsert
  // z ON CONFLICT: znajdź istniejący wiersz i zaktualizuj albo wstaw.
  let existingQuery = admin.from("moderator_notes").select("id").eq("event_id", eventId);
  existingQuery = sessionId === null ? existingQuery.is("session_id", null) : existingQuery.eq("session_id", sessionId);
  const { data: existing } = await existingQuery.maybeSingle();

  let error;
  if (!content.value) {
    if (existing) ({ error } = await admin.from("moderator_notes").delete().eq("id", existing.id));
  } else if (existing) {
    ({ error } = await admin.from("moderator_notes").update({ content: content.value }).eq("id", existing.id));
  } else {
    ({ error } = await admin
      .from("moderator_notes")
      .insert({ event_id: eventId, session_id: sessionId, content: content.value }));
  }
  if (error) return { status: "error", message: "Nie udało się zapisać notatki." };

  revalidate(eventId);
  return { status: "success", message: "Zapisano." };
}
