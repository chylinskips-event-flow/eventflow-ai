"use server";

import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventBySlugForRegistration } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTopMatches,
  getCachedMatches,
  generateMatchReason,
  type CachedMatch,
} from "@/lib/matchmaking";

const REFRESH_LIMIT_MS = 60 * 60 * 1000; // 60 minut

/**
 * Przelicza i cache'uje top 3 dopasowania dla zalogowanego uczestnika,
 * zwraca aktualny stan cache.
 *
 * BEZPIECZEŃSTWO: tożsamość WYŁĄCZNIE z getCurrentAttendee(slug) (cookie) —
 * attendee_id nigdy z parametru. Dostęp przez service_role (RLS ukrywa tabelę).
 *
 * Cache flow:
 *  - limit odświeżania oparty o attendees.matches_generated_at: jeśli ostatnie
 *    generowanie < 60 min temu, serwujemy cache (zero przeliczeń, zero LLM);
 *  - inaczej: przeliczamy top 3, reużywamy istniejące reason (zero wywołań),
 *    czyścimy i wstawiamy świeży zestaw (score + reason reużyte lub NULL),
 *    LLM tylko dla brakujących uzasadnień, na końcu stemplujemy
 *    matches_generated_at (działa też przy 0 wynikach → odróżnia STAN 3 od 1).
 */
export async function generateMatches(slug: string): Promise<CachedMatch[]> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return [];
  }

  const event = await getEventBySlugForRegistration(slug);
  if (!event) {
    return [];
  }

  const supabase = createAdminClient();

  const fresh =
    attendee.matches_generated_at !== null &&
    Date.now() - new Date(attendee.matches_generated_at).getTime() <
      REFRESH_LIMIT_MS;

  if (!fresh) {
    const top = await getTopMatches(event.id, attendee.id, 3);

    // Zachowaj dotychczasowe reason — istniejący reason = zero wywołań LLM.
    const { data: existing } = await supabase
      .from("match_suggestions")
      .select("suggested_attendee_id, reason")
      .eq("event_id", event.id)
      .eq("attendee_id", attendee.id);
    const priorReasons = new Map(
      (existing ?? []).map((row) => [
        row.suggested_attendee_id as string,
        row.reason as string | null,
      ]),
    );

    // Świeży zestaw: usuwamy stare wpisy i wstawiamy aktualne top 3.
    await supabase
      .from("match_suggestions")
      .delete()
      .eq("event_id", event.id)
      .eq("attendee_id", attendee.id);

    for (const match of top) {
      const priorReason = priorReasons.get(match.attendee.id) ?? null;

      await supabase.from("match_suggestions").insert({
        event_id: event.id,
        attendee_id: attendee.id,
        suggested_attendee_id: match.attendee.id,
        score: match.score,
        reason: priorReason,
      });

      if (!priorReason) {
        const reason = await generateMatchReason(attendee, match.attendee);
        if (reason) {
          await supabase
            .from("match_suggestions")
            .update({ reason })
            .eq("event_id", event.id)
            .eq("attendee_id", attendee.id)
            .eq("suggested_attendee_id", match.attendee.id);
        }
      }
    }

    // Stempel ostatniego generowania — także przy 0 wynikach (STAN 3 ≠ STAN 1)
    // i jako źródło prawdy dla limitu 60 min.
    await supabase
      .from("attendees")
      .update({ matches_generated_at: new Date().toISOString() })
      .eq("id", attendee.id);
  }

  return getCachedMatches(event.id, attendee.id);
}

/**
 * Cienki wrapper dla komponentu klienckiego: wyzwala generowanie i NIC nie
 * zwraca — dzięki temu pełny Attendee (z emailem) nie przechodzi do przeglądarki.
 */
export async function refreshMatches(slug: string): Promise<void> {
  await generateMatches(slug);
}
