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
  const moderatorId = formData.get("moderator_id");
  // Kolejność zaznaczeń w formularzu = position.
  const speakerIds = Array.from(
    new Set(
      formData
        .getAll("speaker_ids")
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  );

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Podaj tytuł sesji." } as const;
  }

  const moderator =
    typeof moderatorId === "string" && moderatorId ? moderatorId : null;
  if (moderator && !speakerIds.includes(moderator)) {
    return {
      error: "Moderator musi być jednym z wybranych prelegentów.",
    } as const;
  }

  if (typeof startsAt !== "string" || !startsAt) {
    return { error: "Podaj datę i godzinę rozpoczęcia." } as const;
  }

  const duration = Number(durationRaw);
  if (!Number.isFinite(duration) || duration < 5 || duration > 720) {
    return {
      error: "Czas trwania musi wynosić od 5 do 720 minut.",
    } as const;
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
    },
    // Wiersze do session_speakers (bez session_id — dokładany przy zapisie).
    speakerLinks: speakerIds.map((id, index) => ({
      speaker_id: id,
      role: id === moderator ? "moderator" : "speaker",
      position: index,
    })),
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

  const { data: created, error } = await supabase
    .from("sessions")
    .insert({ event_id: eventId, ...parsed.fields })
    .select("id")
    .single();

  if (error || !created) {
    return {
      status: "error",
      message: "Nie udało się dodać sesji. Spróbuj ponownie.",
    };
  }

  if (parsed.speakerLinks.length > 0) {
    const { error: linkError } = await supabase
      .from("session_speakers")
      .insert(
        parsed.speakerLinks.map((link) => ({
          session_id: created.id as string,
          ...link,
        })),
      );

    if (linkError) {
      console.error("createSession: session_speakers insert failed", linkError);
      return {
        status: "error",
        message: "Sesja dodana, ale nie udało się zapisać prelegentów.",
      };
    }
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

  // Przypisania prelegentów: pełna wymiana (DELETE + INSERT) — prostsze i
  // spójne z tym, że formularz wysyła kompletną listę w nowej kolejności.
  const { error: deleteError } = await supabase
    .from("session_speakers")
    .delete()
    .eq("session_id", sessionId);

  if (deleteError) {
    console.error("updateSession: session_speakers delete failed", deleteError);
    return {
      status: "error",
      message: "Nie udało się zapisać prelegentów. Spróbuj ponownie.",
    };
  }

  if (parsed.speakerLinks.length > 0) {
    const { error: linkError } = await supabase
      .from("session_speakers")
      .insert(
        parsed.speakerLinks.map((link) => ({
          session_id: sessionId,
          ...link,
        })),
      );

    if (linkError) {
      console.error("updateSession: session_speakers insert failed", linkError);
      return {
        status: "error",
        message: "Nie udało się zapisać prelegentów. Spróbuj ponownie.",
      };
    }
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
