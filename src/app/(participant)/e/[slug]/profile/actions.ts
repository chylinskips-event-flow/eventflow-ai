"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Przełącza widoczność uczestnika na liście networkingowej.
 *
 * BEZPIECZEŃSTWO: tożsamość ustalana WYŁĄCZNIE przez getCurrentAttendee(slug)
 * z cookie — parametr `slug` służy tylko do zawężenia eventu i rewalidacji
 * ścieżek. attendee.id nigdy nie przechodzi przez granicę klient→serwer, więc
 * nie da się przełączyć cudzego profilu podmieniając argument.
 */
export async function updateNetworkingVisibility(
  slug: string,
  visible: boolean,
): Promise<void> {
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    return;
  }

  const supabase = createAdminClient();
  await supabase
    .from("attendees")
    .update({ networking_visible: visible })
    .eq("id", attendee.id);

  revalidatePath(`/e/${slug}/attendees`);
  revalidatePath(`/e/${slug}/profile`);
}

export type UpdateProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const LOOKING_FOR_MAX = 200;

function trimmedOrNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Aktualizuje profil networkingowy zalogowanego uczestnika.
 *
 * BEZPIECZEŃSTWO: tożsamość WYŁĄCZNIE z getCurrentAttendee(slug) (cookie).
 * UPDATE obejmuje tylko pola profilu networkingowego — NIGDY first_name,
 * last_name ani email (dane osobowe zmienia organizator).
 */
export async function updateAttendeeProfile(
  slug: string,
  formData: FormData,
): Promise<UpdateProfileState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: "Sesja wygasła. Odśwież stronę." };
  }

  const interests = formData
    .getAll("interests")
    .filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0,
    );

  const lookingForRaw = formData.get("looking_for");
  const lookingFor =
    typeof lookingForRaw === "string" ? lookingForRaw.trim() : "";
  if (lookingFor.length > LOOKING_FOR_MAX) {
    return {
      status: "error",
      message: `„Czego szukasz" może mieć maksymalnie ${LOOKING_FOR_MAX} znaków.`,
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("attendees")
    .update({
      company: trimmedOrNull(formData.get("company")),
      job_title: trimmedOrNull(formData.get("job_title")),
      industry: trimmedOrNull(formData.get("industry")),
      interests: interests.length > 0 ? interests : null,
      goal: trimmedOrNull(formData.get("goal")),
      looking_for: lookingFor.length > 0 ? lookingFor : null,
    })
    .eq("id", attendee.id);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/e/${slug}/profile`);
  revalidatePath(`/e/${slug}/attendees`);
  return { status: "success", message: "Zapisano ✓" };
}

export type AvatarActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  avatarUrl?: string | null;
};

const AVATAR_BUCKET = "attendee-avatars";
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Ścieżka obiektu w bucketcie wyciągnięta z publicznego URL-a (bez ?v=...).
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}

/**
 * Upload avatara uczestnika.
 *
 * BEZPIECZEŃSTWO: tożsamość WYŁĄCZNIE z getCurrentAttendee(slug). Storage przez
 * service_role (bucket nie ma polityki zapisu dla anon/authenticated —
 * uczestnik nie ma sesji auth). Ścieżka "<event_id>/<attendee_id>.<ext>"
 * budowana z danych serwerowych, nie z klienta.
 */
export async function uploadAttendeeAvatar(
  slug: string,
  formData: FormData,
): Promise<AvatarActionState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: "Sesja wygasła. Odśwież stronę." };
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik ze zdjęciem." };
  }

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return {
      status: "error",
      message: "Zdjęcie musi być w formacie JPG, PNG lub WebP.",
    };
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return { status: "error", message: "Zdjęcie nie może być większe niż 2MB." };
  }

  const supabase = createAdminClient();
  const path = `${attendee.event_id}/${attendee.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return {
      status: "error",
      message: "Nie udało się wgrać zdjęcia. Spróbuj ponownie.",
    };
  }

  // Sprzątamy poprzedni plik, jeśli miał inne rozszerzenie (png -> webp) —
  // inaczej zostałby osierocony w bucketcie.
  if (attendee.avatar_url) {
    const oldPath = storagePathFromPublicUrl(attendee.avatar_url);
    if (oldPath && oldPath !== path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
    }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Cache-busting: nadpisanie tej samej ścieżki inaczej pokazałoby stary
  // obrazek z cache przeglądarki/CDN.
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("attendees")
    .update({ avatar_url: avatarUrl })
    .eq("id", attendee.id);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zdjęcia. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/e/${slug}/profile`);
  revalidatePath(`/e/${slug}/attendees`);
  return { status: "success", message: "Zapisano ✓", avatarUrl };
}

/**
 * Usunięcie avatara: plik z bucketa + avatar_url = NULL. Tożsamość z cookie,
 * storage przez service_role.
 */
export async function removeAttendeeAvatar(
  slug: string,
): Promise<AvatarActionState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: "Sesja wygasła. Odśwież stronę." };
  }

  const supabase = createAdminClient();

  if (attendee.avatar_url) {
    const path = storagePathFromPublicUrl(attendee.avatar_url);
    if (path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    }
  }

  const { error } = await supabase
    .from("attendees")
    .update({ avatar_url: null })
    .eq("id", attendee.id);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się usunąć zdjęcia. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/e/${slug}/profile`);
  revalidatePath(`/e/${slug}/attendees`);
  return { status: "success", message: "Zdjęcie usunięte.", avatarUrl: null };
}
