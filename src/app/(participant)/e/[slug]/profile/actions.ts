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
