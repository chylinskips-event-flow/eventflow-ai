"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SessionFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

function readSessionFields(formData: FormData) {
  const title = formData.get("title");
  const description = formData.get("description");
  const track = formData.get("track");
  const room = formData.get("room");
  const startsAt = formData.get("starts_at");
  const endsAt = formData.get("ends_at");
  const speakerId = formData.get("speaker_id");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Podaj tytuł sesji." } as const;
  }

  if (typeof startsAt !== "string" || !startsAt) {
    return { error: "Podaj datę i godzinę rozpoczęcia." } as const;
  }

  if (typeof endsAt !== "string" || !endsAt) {
    return { error: "Podaj datę i godzinę zakończenia." } as const;
  }

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return {
      error: "Czas zakończenia musi być późniejszy niż czas rozpoczęcia.",
    } as const;
  }

  return {
    fields: {
      title: title.trim(),
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
      track: typeof track === "string" && track.trim() ? track.trim() : null,
      room: typeof room === "string" && room.trim() ? room.trim() : null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      speaker_id:
        typeof speakerId === "string" && speakerId ? speakerId : null,
    },
  } as const;
}

export async function createSession(
  eventId: string,
  _prevState: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const parsed = readSessionFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .insert({ event_id: eventId, ...parsed.fields });

  if (error) {
    return {
      status: "error",
      message: "Nie udało się dodać sesji. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/sessions`);
  return { status: "success", message: "Sesja dodana." };
}

export async function updateSession(
  eventId: string,
  sessionId: string,
  _prevState: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const parsed = readSessionFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update(parsed.fields)
    .eq("id", sessionId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/sessions`);
  return { status: "success", message: "Zapisano zmiany." };
}

export async function deleteSession(
  eventId: string,
  sessionId: string,
): Promise<SessionFormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("event_id", eventId);

  if (error) {
    return {
      status: "error",
      message: `Nie udało się usunąć sesji: ${error.message}`,
    };
  }

  revalidatePath(`/admin/events/${eventId}/sessions`);
  return { status: "success", message: "Sesja usunięta." };
}
