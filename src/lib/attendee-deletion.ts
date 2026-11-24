import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET, avatarPathsFor } from "@/lib/avatar-storage";

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
 * Bilety uczestnika w tym wydarzeniu są anulowane, a miejsca wracają do puli w tej samej
 * transakcji co usunięcie rekordu (delete_attendee_releasing_tickets) — inaczej usunięta osoba
 * trwale zajmowałaby miejsce, a nieudane usunięcie zostawiłoby istniejącego uczestnika bez
 * ważnych biletów. Błąd samego zwolnienia nie blokuje usunięcia danych osobowych.
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
    .select("event_id")
    .eq("id", attendeeId)
    .maybeSingle();

  const { error } = await supabase.rpc("delete_attendee_releasing_tickets", {
    p_attendee_id: attendeeId,
  });

  if (error) {
    return { error: error.message };
  }

  // Kasujemy pliki wyłącznie spod ścieżek tego uczestnika ("<event_id>/<id>.<ext>"),
  // wyznaczonych z identyfikatorów w bazie — nie z treści avatar_url.
  if (attendee?.event_id) {
    await supabase.storage.from(AVATAR_BUCKET).remove(avatarPathsFor(attendee.event_id, attendeeId));
  }

  return { error: null };
}
