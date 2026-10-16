"use server";

import { getOwnOrganization } from "@/lib/organizations";
import { getOwnEvent } from "@/lib/events";
import { checkEventSlug, type EventSlugCheck } from "@/lib/event-slug";

/**
 * Sprawdzenie dostępności adresu strony wydarzenia na żywo (pole „Adres strony wydarzenia”).
 * Tylko dla zalogowanego organizatora; przy edycji pomijamy własne wydarzenie (po sprawdzeniu,
 * że należy do organizatora). Zapis i tak weryfikuje unikalność ponownie.
 */
export async function checkEventSlugAvailability(slug: string, eventId: string | null): Promise<EventSlugCheck | null> {
  if (typeof slug !== "string" || slug.length > 200) return null;
  const organization = await getOwnOrganization();
  if (!organization) return null;
  const ownEvent = eventId ? await getOwnEvent(eventId) : null;
  try {
    return await checkEventSlug(slug, ownEvent?.id ?? null);
  } catch (e) {
    console.error("[event-slug] availability check failed", e instanceof Error ? e.message : e);
    return null;
  }
}
