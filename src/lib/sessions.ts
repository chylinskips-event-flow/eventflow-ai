import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Speaker } from "@/lib/speakers";

export type SessionSpeakerRole = "speaker" | "moderator";

/**
 * Prelegent przypisany do sesji. CELOWO bez `position` — konsumenci potrzebują
 * tylko kolejności (już zastosowanej: tablica jest posortowana) i roli.
 * Wystawianie position obok posortowanej tablicy = dwa źródła prawdy o
 * kolejności. position żyje w bazie i w zapisie formularza.
 */
export type SessionSpeaker = {
  speaker: Speaker;
  role: SessionSpeakerRole;
};

export type Session = {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  track: string | null;
  room: string | null;
  starts_at: string | null;
  ends_at: string | null;
  speakers: SessionSpeaker[];
  created_at: string;
  updated_at: string;
};

// Jeden round-trip: join robi Postgres na indeksach zamiast JS.
const SESSION_SELECT = "*, session_speakers(role, position, speakers(*))";

type SessionRow = Omit<Session, "speakers"> & {
  session_speakers: {
    role: SessionSpeakerRole;
    position: number;
    speakers: Speaker | null;
  }[] | null;
};

function mapSession(row: SessionRow): Session {
  const { session_speakers, ...rest } = row;
  const speakers = (session_speakers ?? [])
    .filter((link) => link.speakers !== null)
    .sort((a, b) => a.position - b.position)
    .map((link) => ({
      speaker: link.speakers as Speaker,
      role: link.role,
    }));

  return { ...rest, speakers };
}

export async function getEventSessions(eventId: string): Promise<Session[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true });

  return ((data ?? []) as unknown as SessionRow[]).map(mapSession);
}

/**
 * Wariant dla stron uczestnika (service_role) — autoryzacja jest już
 * ustalona przez getCurrentAttendee() przed wywołaniem tej funkcji, więc nie
 * ograniczamy się do publicznej polityki RLS "tylko published/live"; dawni
 * uczestnicy zachowują wgląd w agendę także po zakończeniu eventu.
 */
export async function getEventSessionsForParticipant(
  eventId: string,
): Promise<Session[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true });

  return ((data ?? []) as unknown as SessionRow[]).map(mapSession);
}
