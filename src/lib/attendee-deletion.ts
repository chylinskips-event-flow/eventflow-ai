import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET, storagePathFromPublicUrl } from "@/lib/avatar-storage";

/**
 * Trwałe, całkowite usunięcie danych uczestnika: rekord w attendees + avatar
 * z bucketa. Wszystkie rekordy powiązane (agenda, kontakty, sugestie, głosy,
 * check-iny itd.) znikają kaskadą FK (ON DELETE CASCADE / SET NULL — patrz
 * migracja 20260706100000).
 *
 * Wspólne dla samoobsługi (uczestnik z cookie) i panelu organizatora. Używa
 * service_role — tożsamość/uprawnienia MUSZĄ być zweryfikowane przez wywołującego
 * PRZED wejściem tutaj (getCurrentAttendee albo getOwnEvent + kontrola event_id).
 *
 * Kolejność: najpierw kasujemy rekord (operacja autorytatywna), potem plik.
 * Gdyby usunięcie pliku zawiodło, zostaje najwyżej osierocony obiekt w bucketcie
 * — nie blokuje to usunięcia danych osobowych, które jest tu celem nadrzędnym.
 */
export async function deleteAttendeeCompletely(
  attendeeId: string,
): Promise<{ error: string | null }> {
  const supabase = createAdminClient();

  const { data: attendee } = await supabase
    .from("attendees")
    .select("avatar_url")
    .eq("id", attendeeId)
    .maybeSingle();

  const { error } = await supabase
    .from("attendees")
    .delete()
    .eq("id", attendeeId);

  if (error) {
    return { error: error.message };
  }

  if (attendee?.avatar_url) {
    const path = storagePathFromPublicUrl(attendee.avatar_url);
    if (path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    }
  }

  return { error: null };
}
