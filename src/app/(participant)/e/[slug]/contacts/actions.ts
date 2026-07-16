"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";

export type ContactActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const NOTE_MAX = 500;
const SESSION_EXPIRED = "Sesja wygasła. Odśwież stronę.";

function revalidateContactPaths(slug: string) {
  revalidatePath(`/e/${slug}/contacts`);
  revalidatePath(`/e/${slug}/attendees`);
}

/**
 * Wysyła prośbę o kontakt do innego uczestnika.
 *
 * BEZPIECZEŃSTWO: requester_id WYŁĄCZNIE z getCurrentAttendee(slug) (cookie) —
 * z klienta przychodzi tylko recipientId. Inaczej dałoby się wysyłać prośby
 * w cudzym imieniu.
 *
 * Notatki celowo NIE ma w parametrach: requester_note jest prywatną notatką
 * autora, powstaje dopiero w sekcji "Twoje kontakty" i nigdy nie trafia
 * do odbiorcy.
 */
export async function sendContactRequest(
  slug: string,
  recipientId: string,
): Promise<ContactActionState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: SESSION_EXPIRED };
  }

  if (recipientId === attendee.id) {
    return { status: "error", message: "Nie możesz zaprosić samego siebie." };
  }

  const supabase = createAdminClient();

  // Odbiorca musi być zatwierdzonym uczestnikiem TEGO eventu — bez tego można
  // by wystrzelić prośbę do dowolnego attendee.id z innego wydarzenia.
  const { data: recipient } = await supabase
    .from("attendees")
    .select("id")
    .eq("id", recipientId)
    .eq("event_id", attendee.event_id)
    .eq("status", "approved")
    .maybeSingle();

  if (!recipient) {
    return { status: "error", message: "Nie znaleziono takiego uczestnika." };
  }

  // Prośba odwrotna (on → ja, pending): UNIQUE jest kierunkowy, więc A→B i B→A
  // to dwa legalne wiersze — bez tego para wpadłaby we wzajemny "pending",
  // każdy czekając na drugiego. Kliknięcie "Poproś o kontakt" w takiej sytuacji
  // jest w istocie akceptacją.
  const { data: reverse } = await supabase
    .from("contact_requests")
    .select("id")
    .eq("event_id", attendee.event_id)
    .eq("requester_id", recipientId)
    .eq("recipient_id", attendee.id)
    .eq("status", "pending")
    .maybeSingle();

  if (reverse) {
    const { error } = await supabase
      .from("contact_requests")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", reverse.id)
      .eq("status", "pending");

    if (error) {
      return {
        status: "error",
        message: "Nie udało się wysłać prośby. Spróbuj ponownie.",
      };
    }

    revalidateContactPaths(slug);
    return { status: "success", message: "Kontakt nawiązany ✓" };
  }

  const { error } = await supabase.from("contact_requests").insert({
    event_id: attendee.event_id,
    requester_id: attendee.id,
    recipient_id: recipientId,
  });

  if (error) {
    // 23505 = UNIQUE(event_id, requester_id, recipient_id): prośba już istnieje
    // (np. dwa kliknięcia). Nie jest to błąd z punktu widzenia użytkownika.
    if (error.code === "23505") {
      revalidateContactPaths(slug);
      return { status: "success", message: "Prośba została już wysłana." };
    }
    return {
      status: "error",
      message: "Nie udało się wysłać prośby. Spróbuj ponownie.",
    };
  }

  revalidateContactPaths(slug);
  return { status: "success", message: "Prośba wysłana ✓" };
}

/**
 * Odpowiedź na przychodzącą prośbę.
 *
 * BEZPIECZEŃSTWO: filtr .eq("recipient_id", attendee.id) sprawia, że odpowiada
 * WYŁĄCZNIE odbiorca — inaczej ktokolwiek znający requestId zaakceptowałby
 * własną prośbę za drugą stronę. Filtr .eq("status", "pending") daje
 * idempotencję bez wyścigu: brak trafionego wiersza = już odpowiedziano.
 */
export async function respondToContactRequest(
  slug: string,
  requestId: string,
  accept: boolean,
): Promise<ContactActionState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: SESSION_EXPIRED };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contact_requests")
    .update({
      status: accept ? "accepted" : "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("recipient_id", attendee.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.",
    };
  }

  if (!data || data.length === 0) {
    return {
      status: "error",
      message: "Ta prośba nie czeka już na odpowiedź.",
    };
  }

  revalidateContactPaths(slug);
  return {
    status: "success",
    message: accept ? "Kontakt nawiązany ✓" : "Prośba odrzucona.",
  };
}

/**
 * Prywatna notatka o kontakcie. Zapis trafia do kolumny należącej do
 * pytającego — requester pisze do requester_note, recipient do recipient_note.
 * Filtr po obu FK gwarantuje, że można notować wyłącznie własne kontakty.
 */
export async function updateContactNote(
  slug: string,
  requestId: string,
  note: string,
): Promise<ContactActionState> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) {
    return { status: "error", message: SESSION_EXPIRED };
  }

  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX) {
    return {
      status: "error",
      message: `Notatka może mieć maksymalnie ${NOTE_MAX} znaków.`,
    };
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("contact_requests")
    .select("id, requester_id, recipient_id")
    .eq("id", requestId)
    .eq("status", "accepted")
    .or(`requester_id.eq.${attendee.id},recipient_id.eq.${attendee.id}`)
    .maybeSingle();

  if (!row) {
    return { status: "error", message: "Nie znaleziono tego kontaktu." };
  }

  const column =
    row.requester_id === attendee.id ? "requester_note" : "recipient_note";

  const { error } = await supabase
    .from("contact_requests")
    .update({ [column]: trimmed.length > 0 ? trimmed : null })
    .eq("id", requestId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać notatki. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/e/${slug}/contacts`);
  return { status: "success", message: "Zapisano ✓" };
}
