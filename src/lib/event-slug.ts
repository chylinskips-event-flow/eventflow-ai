// Dostępność adresu strony wydarzenia (slug jest globalnie unikalny: eventro.pl/e/<slug>).
// Server-only: service_role, bo RLS pokazuje organizatorowi tylko jego wydarzenia, a adres musi
// być wolny także u innych. Zwracamy wyłącznie „wolny / zajęty” + propozycję — żadnych danych
// cudzych wydarzeń.
import { createAdminClient } from "@/lib/supabase/admin";
import { RESERVED_SLUGS, slugCandidate, validateSlug } from "@/lib/slug";

export type EventSlugCheck =
  | { status: "available" }
  | { status: "invalid"; message: string }
  | { status: "taken"; suggestion: string | null };

/** Ile kolejnych wariantów z numerem sprawdzamy jednym zapytaniem. */
const SUGGESTION_BATCH = 20;

async function takenSlugs(slugs: string[], excludeEventId: string | null): Promise<Set<string>> {
  let q = createAdminClient().from("events").select("slug").in("slug", slugs);
  if (excludeEventId) q = q.neq("id", excludeEventId);
  const { data, error } = await q;
  if (error) throw new Error(`[event-slug] check failed: ${error.code ?? ""} ${error.message}`);
  return new Set((data ?? []).map((r) => r.slug as string));
}

/** Pierwszy wolny wariant `base-2`, `base-3`… (pomijając zarezerwowane); null gdy brak w paczce. */
export async function suggestEventSlug(base: string, excludeEventId: string | null = null): Promise<string | null> {
  const candidates = Array.from({ length: SUGGESTION_BATCH }, (_, i) => slugCandidate(base, i + 2)).filter(
    (s) => !RESERVED_SLUGS.has(s),
  );
  const taken = await takenSlugs(candidates, excludeEventId);
  return candidates.find((s) => !taken.has(s)) ?? null;
}

/** Czy adres jest poprawny i wolny (z pominięciem edytowanego wydarzenia). */
export async function checkEventSlug(slug: string, excludeEventId: string | null = null): Promise<EventSlugCheck> {
  const invalid = validateSlug(slug);
  if (invalid) return { status: "invalid", message: invalid };
  const taken = await takenSlugs([slug], excludeEventId);
  if (!taken.has(slug)) return { status: "available" };
  return { status: "taken", suggestion: await suggestEventSlug(slug, excludeEventId) };
}

/** Komunikat dla zajętego adresu (z propozycją, jeśli jest). */
export function takenSlugMessage(suggestion: string | null): string {
  return suggestion ? `Ten adres jest zajęty — spróbuj: ${suggestion}` : "Ten adres jest zajęty — wybierz inny.";
}
