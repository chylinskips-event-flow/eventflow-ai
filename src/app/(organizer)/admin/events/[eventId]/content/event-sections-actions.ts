"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnEvent } from "@/lib/events";
import {
  type SectionType,
  validateSectionContent,
  defaultContent,
  getEventSections,
} from "@/lib/event-sections";
import sharp from "sharp";
import { featureGate } from "@/lib/entitlements";

const STORAGE_BUCKET = "event-sections";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function createEventSection(
  eventId: string,
  type: SectionType,
): Promise<{ ok: boolean; error?: string }> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu." };
  const gate = await featureGate(event.organization_id, "page_builder");
  if (!gate.ok) return { ok: false, error: gate.message };
  if (type === "galeria") {
    const galleryGate = await featureGate(event.organization_id, "photo_gallery");
    if (!galleryGate.ok) return { ok: false, error: galleryGate.message };
  }

  const existing = await getEventSections(eventId);
  const maxPos = existing.reduce((m, s) => Math.max(m, s.position), -1);

  const supabase = createAdminClient();
  const { error } = await supabase.from("event_sections").insert({
    event_id: eventId,
    type,
    position: maxPos + 1,
    enabled: true,
    content: defaultContent(type),
  });

  if (error) return { ok: false, error: "Nie udało się dodać sekcji." };

  revalidatePath(`/admin/events/${eventId}/content`);
  return { ok: true };
}

export async function updateEventSectionContent(
  eventId: string,
  sectionId: string,
  content: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu." };
  const gate = await featureGate(event.organization_id, "page_builder");
  if (!gate.ok) return { ok: false, error: gate.message };

  const supabase = createAdminClient();
  const { data: section } = await supabase
    .from("event_sections")
    .select("type")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!section) return { ok: false, error: "Sekcja nie istnieje." };

  const validationError = validateSectionContent(section.type as SectionType, content);
  if (validationError) return { ok: false, error: validationError };

  const { error } = await supabase
    .from("event_sections")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", sectionId)
    .eq("event_id", eventId);

  if (error) return { ok: false, error: "Nie udało się zapisać sekcji." };

  revalidatePath(`/admin/events/${eventId}/content`);
  return { ok: true };
}

export async function toggleEventSection(
  eventId: string,
  sectionId: string,
  enabled: boolean,
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  await supabase
    .from("event_sections")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", sectionId)
    .eq("event_id", eventId);

  revalidatePath(`/admin/events/${eventId}/content`);
}

export async function deleteEventSection(
  eventId: string,
  sectionId: string,
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  await supabase
    .from("event_sections")
    .delete()
    .eq("id", sectionId)
    .eq("event_id", eventId);

  revalidatePath(`/admin/events/${eventId}/content`);
}

export async function reorderEventSections(
  eventId: string,
  orderedIds: string[],
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  // Verify all sections belong to this event before updating
  const { data: existing } = await supabase
    .from("event_sections")
    .select("id")
    .eq("event_id", eventId);
  const ownedIds = new Set((existing ?? []).map((s: { id: string }) => s.id));
  const safeIds = orderedIds.filter((id) => ownedIds.has(id));

  await Promise.all(
    safeIds.map((id, index) =>
      supabase
        .from("event_sections")
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("event_id", eventId),
    ),
  );

  revalidatePath(`/admin/events/${eventId}/content`);
}

export async function uploadGaleriaImage(
  eventId: string,
  sectionId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; storage_path?: string; public_url?: string }> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu." };
  const gate = await featureGate(event.organization_id, "photo_gallery");
  if (!gate.ok) return { ok: false, error: gate.message };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Wybierz plik." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: "Dozwolone formaty: JPEG, PNG, WebP." };
  if (file.size > MAX_IMAGE_BYTES)
    return { ok: false, error: "Plik nie może być większy niż 8 MB." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const webpBuffer = await sharp(buffer)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const path = `${eventId}/${sectionId}/${Date.now()}.webp`;
  const supabase = createAdminClient();

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, webpBuffer, { contentType: "image/webp", upsert: false });

  if (uploadError) return { ok: false, error: "Nie udało się wgrać zdjęcia." };

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  // Append to content.images
  const { data: section } = await supabase
    .from("event_sections")
    .select("content")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!section) return { ok: false, error: "Sekcja nie istnieje." };

  const existingImages = Array.isArray((section.content as Record<string, unknown>).images)
    ? ((section.content as Record<string, unknown>).images as { storage_path: string; alt?: string }[])
    : [];

  await supabase
    .from("event_sections")
    .update({
      content: { ...(section.content as Record<string, unknown>), images: [...existingImages, { storage_path: path, alt: "" }] },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId)
    .eq("event_id", eventId);

  revalidatePath(`/admin/events/${eventId}/content`);
  return { ok: true, storage_path: path, public_url: publicUrl };
}

export async function removeGaleriaImage(
  eventId: string,
  sectionId: string,
  storagePath: string,
): Promise<void> {
  const event = await getOwnEvent(eventId);
  if (!event) return;

  const supabase = createAdminClient();
  const { data: section } = await supabase
    .from("event_sections")
    .select("content")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!section) return;

  const images = Array.isArray((section.content as Record<string, unknown>).images)
    ? ((section.content as Record<string, unknown>).images as { storage_path: string }[])
    : [];

  const filtered = images.filter((img) => img.storage_path !== storagePath);

  await supabase
    .from("event_sections")
    .update({
      content: { ...(section.content as Record<string, unknown>), images: filtered },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId)
    .eq("event_id", eventId);

  // Remove from Storage (best-effort)
  supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {});

  revalidatePath(`/admin/events/${eventId}/content`);
}
