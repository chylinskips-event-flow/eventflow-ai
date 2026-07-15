"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseLines } from "@/lib/events";
import { SLUG_PATTERN } from "@/lib/slug";

export type EventFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function updateEvent(
  eventId: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const name = formData.get("name");
  const slug = formData.get("slug");
  const startsAt = formData.get("starts_at");
  const endsAt = formData.get("ends_at");
  const timezone = formData.get("timezone");
  const location = formData.get("location");
  const primaryColor = formData.get("primary_color");
  const roomNames = parseLines(formData.get("room_names"));
  const interestOptions = parseLines(formData.get("interest_options"));
  const requiresApproval = formData.get("requires_approval") === "on";

  if (typeof name !== "string" || !name.trim()) {
    return { status: "error", message: "Podaj nazwę eventu." };
  }

  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    return {
      status: "error",
      message:
        "Adres może zawierać tylko małe litery, cyfry i myślniki (np. moj-event).",
    };
  }

  if (typeof startsAt !== "string" || !startsAt) {
    return { status: "error", message: "Podaj datę i godzinę rozpoczęcia." };
  }

  if (typeof endsAt !== "string" || !endsAt) {
    return { status: "error", message: "Podaj datę i godzinę zakończenia." };
  }

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return {
      status: "error",
      message: "Data zakończenia musi być późniejsza niż data rozpoczęcia.",
    };
  }

  if (typeof timezone !== "string" || !timezone) {
    return { status: "error", message: "Wybierz strefę czasową." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("slug", slug)
    .neq("id", eventId)
    .maybeSingle();

  if (existing) {
    return {
      status: "error",
      message: "Ten adres jest już zajęty, wybierz inny.",
    };
  }

  const { error } = await supabase
    .from("events")
    .update({
      name: name.trim(),
      slug,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      timezone,
      location:
        typeof location === "string" && location.trim()
          ? location.trim()
          : null,
      primary_color:
        typeof primaryColor === "string" && primaryColor.trim()
          ? primaryColor.trim()
          : null,
      room_names: roomNames,
      // Pusta lista -> NULL: fallback do domyślnej, zahardkodowanej listy.
      interest_options: interestOptions.length > 0 ? interestOptions : null,
      requires_approval: requiresApproval,
    })
    .eq("id", eventId);

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Ten adres jest już zajęty, wybierz inny.",
      };
    }
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { status: "success", message: "Zapisano zmiany." };
}

export async function publishEvent(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId)
    .eq("status", "draft")
    .select();

  if (error) {
    throw new Error(`Publish failed: ${error.message} (code: ${error.code})`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Update affected 0 rows — sprawdź RLS lub czy event istnieje",
    );
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
}

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadEventLogo(
  eventId: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik logo." };
  }

  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return {
      status: "error",
      message: "Logo musi być w formacie JPEG, PNG lub WebP.",
    };
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return {
      status: "error",
      message: "Logo nie może być większe niż 5MB.",
    };
  }

  const supabase = await createClient();
  const extension = file.name.split(".").pop() ?? "png";
  const path = `${eventId}/logo-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("event-logos")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return {
      status: "error",
      message: "Nie udało się wgrać logo. Spróbuj ponownie.",
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-logos").getPublicUrl(path);

  const { error } = await supabase
    .from("events")
    .update({ logo_url: publicUrl })
    .eq("id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać logo. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { status: "success", message: "Logo zapisane." };
}
