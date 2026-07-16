"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, parseDateTimeLocal } from "@/lib/format";

export type SessionFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA;
}

async function findRoomCollision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  room: string,
  startsAtTime: number,
  endsAtTime: number,
  excludeSessionId?: string,
) {
  let query = supabase
    .from("sessions")
    .select("id, title, starts_at, ends_at")
    .eq("event_id", eventId)
    .eq("room", room);

  if (excludeSessionId) {
    query = query.neq("id", excludeSessionId);
  }

  const { data } = await query;

  return (data ?? []).find((other) => {
    if (!other.starts_at || !other.ends_at) return false;
    return rangesOverlap(
      startsAtTime,
      endsAtTime,
      new Date(other.starts_at).getTime(),
      new Date(other.ends_at).getTime(),
    );
  });
}

async function readSessionFields(
  formData: FormData,
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  eventRange: {
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
  },
  excludeSessionId?: string,
) {
  const title = formData.get("title");
  const description = formData.get("description");
  const track = formData.get("track");
  const room = formData.get("room");
  const startsAt = formData.get("starts_at");
  const durationRaw = formData.get("duration_minutes");
  const speakerId = formData.get("speaker_id");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Podaj tytuł sesji." } as const;
  }

  if (typeof startsAt !== "string" || !startsAt) {
    return { error: "Podaj datę i godzinę rozpoczęcia." } as const;
  }

  const duration = Number(durationRaw);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { error: "Wybierz czas trwania sesji." } as const;
  }

  // Naiwną godzinę startu interpretujemy w strefie eventu; koniec to czysta
  // arytmetyka epoch (start + czas trwania) — strefa bez znaczenia.
  const startsAtIso = parseDateTimeLocal(startsAt, eventRange.timezone);
  const startsAtTime = new Date(startsAtIso).getTime();
  const endsAtTime = startsAtTime + duration * 60000;
  const endsAtIso = new Date(endsAtTime).toISOString();

  if (eventRange.starts_at && eventRange.ends_at) {
    const eventStart = new Date(eventRange.starts_at).getTime();
    const eventEnd = new Date(eventRange.ends_at).getTime();

    if (startsAtTime < eventStart || endsAtTime > eventEnd) {
      return {
        error: `Data sesji musi mieścić się w terminie eventu: ${formatDateTime(eventRange.starts_at, eventRange.timezone)} – ${formatDateTime(eventRange.ends_at, eventRange.timezone)}.`,
      } as const;
    }
  }

  const trimmedRoom =
    typeof room === "string" && room.trim() ? room.trim() : null;

  if (trimmedRoom) {
    const collision = await findRoomCollision(
      supabase,
      eventId,
      trimmedRoom,
      startsAtTime,
      endsAtTime,
      excludeSessionId,
    );

    if (collision) {
      return {
        error: `Kolizja: sesja „${collision.title}” w sali „${trimmedRoom}” pokrywa się czasowo.`,
      } as const;
    }
  }

  return {
    fields: {
      title: title.trim(),
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
      track: typeof track === "string" && track.trim() ? track.trim() : null,
      room: trimmedRoom,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      speaker_id:
        typeof speakerId === "string" && speakerId ? speakerId : null,
    },
  } as const;
}

async function getEventDateRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const { data } = await supabase
    .from("events")
    .select("starts_at, ends_at, timezone")
    .eq("id", eventId)
    .maybeSingle();

  return {
    starts_at: data?.starts_at ?? null,
    ends_at: data?.ends_at ?? null,
    timezone: data?.timezone ?? null,
  };
}

export async function createSession(
  eventId: string,
  _prevState: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const supabase = await createClient();
  const eventRange = await getEventDateRange(supabase, eventId);

  const parsed = await readSessionFields(formData, supabase, eventId, eventRange);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

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
  const supabase = await createClient();
  const eventRange = await getEventDateRange(supabase, eventId);

  const parsed = await readSessionFields(
    formData,
    supabase,
    eventId,
    eventRange,
    sessionId,
  );
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

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
    console.error("deleteSession failed:", error);
    return {
      status: "error",
      message: "Nie udało się usunąć sesji. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}/sessions`);
  return { status: "success", message: "Sesja usunięta." };
}
