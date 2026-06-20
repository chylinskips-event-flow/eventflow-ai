"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SpeakerFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  warning?: boolean;
};

function readSpeakerFields(formData: FormData) {
  const firstName = formData.get("first_name");
  const lastName = formData.get("last_name");
  const bio = formData.get("bio");
  const company = formData.get("company");

  if (typeof firstName !== "string" || !firstName.trim()) {
    return { error: "Podaj imię." } as const;
  }

  if (typeof lastName !== "string" || !lastName.trim()) {
    return { error: "Podaj nazwisko." } as const;
  }

  return {
    fields: {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
      company:
        typeof company === "string" && company.trim() ? company.trim() : null,
    },
  } as const;
}

type PhotoUploadResult = "ok" | "upload_error" | "update_error";

async function uploadSpeakerPhotoAndUpdateRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  speakerId: string,
  photo: File,
): Promise<PhotoUploadResult> {
  const extension = photo.name.split(".").pop() ?? "jpg";
  const path = `${eventId}/${speakerId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("speaker-photos")
    .upload(path, photo, { contentType: photo.type, upsert: true });

  if (uploadError) {
    return "upload_error";
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("speaker-photos").getPublicUrl(path);

  const { error } = await supabase
    .from("speakers")
    .update({ photo_url: publicUrl })
    .eq("id", speakerId);

  if (error) {
    return "update_error";
  }

  return "ok";
}

export async function createSpeaker(
  eventId: string,
  _prevState: SpeakerFormState,
  formData: FormData,
): Promise<SpeakerFormState> {
  const parsed = readSpeakerFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { data: speaker, error } = await supabase
    .from("speakers")
    .insert({ event_id: eventId, ...parsed.fields })
    .select("id")
    .single();

  if (error || !speaker) {
    return {
      status: "error",
      message: "Nie udało się dodać prelegenta. Spróbuj ponownie.",
    };
  }

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const result = await uploadSpeakerPhotoAndUpdateRecord(
      supabase,
      eventId,
      speaker.id,
      photo,
    );

    if (result !== "ok") {
      revalidatePath(`/admin/events/${eventId}/speakers`);
      return {
        status: "success",
        warning: true,
        message:
          "Prelegent dodany, ale nie udało się zapisać zdjęcia — możesz dodać je później w edycji.",
      };
    }
  }

  revalidatePath(`/admin/events/${eventId}/speakers`);
  return { status: "success", message: "Prelegent dodany." };
}

export async function updateSpeaker(
  eventId: string,
  speakerId: string,
  _prevState: SpeakerFormState,
  formData: FormData,
): Promise<SpeakerFormState> {
  const parsed = readSpeakerFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("speakers")
    .update(parsed.fields)
    .eq("id", speakerId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/speakers`);
  return { status: "success", message: "Zapisano zmiany." };
}

export async function uploadSpeakerPhoto(
  eventId: string,
  speakerId: string,
  _prevState: SpeakerFormState,
  formData: FormData,
): Promise<SpeakerFormState> {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik zdjęcia." };
  }

  const supabase = await createClient();
  const result = await uploadSpeakerPhotoAndUpdateRecord(
    supabase,
    eventId,
    speakerId,
    file,
  );

  if (result === "upload_error") {
    return {
      status: "error",
      message: "Nie udało się wgrać zdjęcia. Spróbuj ponownie.",
    };
  }

  if (result === "update_error") {
    return {
      status: "error",
      message: "Nie udało się zapisać zdjęcia. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/speakers`);
  return { status: "success", message: "Zdjęcie zapisane." };
}

export async function deleteSpeaker(eventId: string, speakerId: string) {
  const supabase = await createClient();

  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("speaker_id", speakerId);

  if (count && count > 0) {
    throw new Error(
      `Ten prelegent jest przypisany do ${count} ${count === 1 ? "sesji" : "sesji"} — usuń lub zmień przypisanie najpierw.`,
    );
  }

  const { error } = await supabase
    .from("speakers")
    .delete()
    .eq("id", speakerId)
    .eq("event_id", eventId);

  if (error) {
    throw new Error(`Nie udało się usunąć prelegenta: ${error.message}`);
  }

  revalidatePath(`/admin/events/${eventId}/speakers`);
}
