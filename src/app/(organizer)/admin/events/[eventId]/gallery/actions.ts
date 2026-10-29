"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDateTimeLocal } from "@/lib/format";
import { validateUploadLinkInput } from "@/lib/gallery-core";
import {
  deletePhotos,
  finalizePhotoUpload,
  isUuid,
  saveGallerySettings,
  setPhotosHidden,
  startPhotoUpload,
  type FinalizeResult,
  type PhotoMeta,
  type StartUploadResult,
} from "@/lib/gallery";

export type GalleryAdminState = { status: "idle" | "success" | "error"; message?: string };

/** Właściciel eventu (getOwnEvent) + funkcja event_photos w planie. */
async function organizerContext(eventId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) return { error: "Brak dostępu do wydarzenia." } as const;
  const gate = await featureGate(event.organization_id, "event_photos");
  if (!gate.ok) return { error: gate.message } as const;
  return { event } as const;
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/gallery`);
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function startGalleryUpload(eventId: string, meta: PhotoMeta): Promise<StartUploadResult> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Brak dostępu do wydarzenia." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak dostępu do wydarzenia." };
  return startPhotoUpload(eventId, { kind: "organizer", userId: user.id }, meta);
}

export async function finalizeGalleryUpload(eventId: string, photoId: string): Promise<FinalizeResult> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Brak dostępu do wydarzenia." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak dostępu do wydarzenia." };
  const res = await finalizePhotoUpload(ctx.event, photoId, { kind: "organizer", userId: user.id });
  if (res.ok) revalidate(eventId);
  return res;
}

// ── Zdjęcia ────────────────────────────────────────────────────────────────

export async function setGalleryPhotosHidden(eventId: string, ids: string[], hidden: boolean): Promise<GalleryAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!(await setPhotosHidden(eventId, ids, hidden))) return { status: "error", message: "Nie udało się zapisać zmian." };
  revalidate(eventId);
  return { status: "success" };
}

export async function deleteGalleryPhotos(eventId: string, ids: string[]): Promise<GalleryAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!(await deletePhotos(eventId, ids))) return { status: "error", message: "Nie udało się usunąć zdjęć." };
  revalidate(eventId);
  return { status: "success" };
}

// ── Linki fotografa ────────────────────────────────────────────────────────

export async function createGalleryUploadLink(
  eventId: string,
  _prev: GalleryAdminState,
  formData: FormData,
): Promise<GalleryAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const input = validateUploadLinkInput(formData.get("label"), formData.get("max_photos"));
  if (!input.ok) return { status: "error", message: input.error };

  const rawExpires = formData.get("expires_at");
  let expiresAt: string | null = null;
  if (typeof rawExpires === "string" && rawExpires.trim()) {
    expiresAt = parseDateTimeLocal(rawExpires.trim(), ctx.event.timezone);
    if (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
      return { status: "error", message: "Data ważności musi być w przyszłości." };
    }
  }

  const { error } = await createAdminClient().from("gallery_upload_links").insert({
    event_id: eventId,
    label: input.value.label,
    max_photos: input.value.maxPhotos,
    expires_at: expiresAt,
  });
  if (error) return { status: "error", message: "Nie udało się utworzyć linku." };

  revalidate(eventId);
  return { status: "success", message: "Link utworzony." };
}

/** Unieważnienie jest nieodwracalne — w razie potrzeby tworzy się nowy link. */
export async function revokeGalleryUploadLink(eventId: string, linkId: string): Promise<GalleryAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (!isUuid(linkId)) return { status: "error", message: "Link nie istnieje." };
  const { error } = await createAdminClient()
    .from("gallery_upload_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("event_id", eventId)
    .is("revoked_at", null);
  if (error) return { status: "error", message: "Nie udało się unieważnić linku." };
  revalidate(eventId);
  return { status: "success", message: "Link unieważniony." };
}

// ── Ustawienia ─────────────────────────────────────────────────────────────

export async function saveGallerySettingsAction(
  eventId: string,
  _prev: GalleryAdminState,
  formData: FormData,
): Promise<GalleryAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const info = formData.get("info_text");
  const infoText = typeof info === "string" ? info.trim() : "";
  if (infoText.length > 1000) return { status: "error", message: "Tekst informacji może mieć do 1000 znaków." };

  const ok = await saveGallerySettings(eventId, {
    enabled: formData.get("enabled") === "on",
    watermark_enabled: formData.get("watermark_enabled") === "on",
    info_text: infoText || null,
  });
  if (!ok) return { status: "error", message: "Nie udało się zapisać ustawień." };
  revalidate(eventId);
  return { status: "success", message: "Zapisano." };
}

export async function setGalleryPublished(eventId: string, published: boolean): Promise<GalleryAdminState> {
  const ctx = await organizerContext(eventId);
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const ok = await saveGallerySettings(eventId, { published_at: published ? new Date().toISOString() : null });
  if (!ok) return { status: "error", message: "Nie udało się zapisać zmian." };
  revalidate(eventId);
  return { status: "success", message: published ? "Galeria opublikowana." : "Publikacja cofnięta." };
}
