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
