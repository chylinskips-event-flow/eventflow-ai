"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContentFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  warning?: boolean;
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

type ImageUploadResult =
  | "ok"
  | "invalid_type"
  | "too_large"
  | "upload_error"
  | "update_error";

async function uploadEventContentImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  filenamePrefix: string,
  file: File,
): Promise<{ result: ImageUploadResult; publicUrl?: string }> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { result: "invalid_type" };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { result: "too_large" };
  }

  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${eventId}/${filenamePrefix}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("event-content")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return { result: "upload_error" };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-content").getPublicUrl(path);

  return { result: "ok", publicUrl };
}

export async function uploadEventBanner(
  eventId: string,
  _prevState: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const file = formData.get("banner");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik banera." };
  }

  const supabase = await createClient();
  const { result, publicUrl } = await uploadEventContentImage(
    supabase,
    eventId,
    "banner",
    file,
  );

  if (result === "invalid_type") {
    return {
      status: "error",
      message: "Baner musi być w formacie JPEG, PNG lub WebP.",
    };
  }

  if (result === "too_large") {
    return { status: "error", message: "Baner nie może być większy niż 5MB." };
  }

  if (result === "upload_error" || !publicUrl) {
    return {
      status: "error",
      message: "Nie udało się wgrać banera. Spróbuj ponownie.",
    };
  }

  const { error } = await supabase
    .from("events")
    .update({ banner_url: publicUrl })
    .eq("id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać banera. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success", message: "Baner zapisany." };
}

function readSectionFields(formData: FormData) {
  const title = formData.get("title");
  const body = formData.get("body");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Podaj tytuł sekcji." } as const;
  }

  if (typeof body !== "string" || !body.trim()) {
    return { error: "Podaj treść sekcji." } as const;
  }

  return {
    fields: { title: title.trim(), body: body.trim() },
  } as const;
}

export async function createSection(
  eventId: string,
  _prevState: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const parsed = readSectionFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("event_content_sections")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  const { data: section, error } = await supabase
    .from("event_content_sections")
    .insert({
      event_id: eventId,
      ...parsed.fields,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !section) {
    return {
      status: "error",
      message: "Nie udało się dodać sekcji. Spróbuj ponownie.",
    };
  }

  const photo = formData.get("image");
  if (photo instanceof File && photo.size > 0) {
    const { result, publicUrl } = await uploadEventContentImage(
      supabase,
      eventId,
      `section-${section.id}`,
      photo,
    );

    if (result !== "ok" || !publicUrl) {
      revalidatePath(`/admin/events/${eventId}/content`);
      const message =
        result === "invalid_type"
          ? "Sekcja dodana, ale zdjęcie nie zostało zapisane — dozwolone formaty: JPEG, PNG, WebP."
          : result === "too_large"
            ? "Sekcja dodana, ale zdjęcie nie zostało zapisane — plik jest większy niż 5MB."
            : "Sekcja dodana, ale nie udało się zapisać zdjęcia — możesz dodać je później w edycji.";
      return { status: "success", warning: true, message };
    }

    await supabase
      .from("event_content_sections")
      .update({ image_url: publicUrl })
      .eq("id", section.id);
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success", message: "Sekcja dodana." };
}

export async function updateSection(
  eventId: string,
  sectionId: string,
  _prevState: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const parsed = readSectionFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_content_sections")
    .update(parsed.fields)
    .eq("id", sectionId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success", message: "Zapisano zmiany." };
}

export async function uploadSectionImage(
  eventId: string,
  sectionId: string,
  _prevState: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik zdjęcia." };
  }

  const supabase = await createClient();
  const { result, publicUrl } = await uploadEventContentImage(
    supabase,
    eventId,
    `section-${sectionId}`,
    file,
  );

  if (result === "invalid_type") {
    return {
      status: "error",
      message: "Zdjęcie musi być w formacie JPEG, PNG lub WebP.",
    };
  }

  if (result === "too_large") {
    return { status: "error", message: "Zdjęcie nie może być większe niż 5MB." };
  }

  if (result === "upload_error" || !publicUrl) {
    return {
      status: "error",
      message: "Nie udało się wgrać zdjęcia. Spróbuj ponownie.",
    };
  }

  const { error } = await supabase
    .from("event_content_sections")
    .update({ image_url: publicUrl })
    .eq("id", sectionId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zdjęcia. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success", message: "Zdjęcie zapisane." };
}

export async function removeSectionImage(
  eventId: string,
  sectionId: string,
): Promise<ContentFormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_content_sections")
    .update({ image_url: null })
    .eq("id", sectionId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się usunąć zdjęcia. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success", message: "Zdjęcie usunięte." };
}

export async function deleteSection(
  eventId: string,
  sectionId: string,
): Promise<ContentFormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_content_sections")
    .delete()
    .eq("id", sectionId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: `Nie udało się usunąć sekcji: ${error.message}`,
    };
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success", message: "Sekcja usunięta." };
}

export async function moveSection(
  eventId: string,
  sectionId: string,
  direction: "up" | "down",
): Promise<ContentFormState> {
  const supabase = await createClient();

  const { data: sections } = await supabase
    .from("event_content_sections")
    .select("id, position")
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  if (!sections) {
    return { status: "error", message: "Nie udało się zmienić kolejności." };
  }

  const index = sections.findIndex((section) => section.id === sectionId);
  const adjacentIndex = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || adjacentIndex < 0 || adjacentIndex >= sections.length) {
    return { status: "error", message: "Nie można zmienić kolejności." };
  }

  const current = sections[index];
  const adjacent = sections[adjacentIndex];

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    supabase
      .from("event_content_sections")
      .update({ position: adjacent.position })
      .eq("id", current.id),
    supabase
      .from("event_content_sections")
      .update({ position: current.position })
      .eq("id", adjacent.id),
  ]);

  if (error1 || error2) {
    return {
      status: "error",
      message: "Nie udało się zmienić kolejności. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/content`);
  return { status: "success" };
}
