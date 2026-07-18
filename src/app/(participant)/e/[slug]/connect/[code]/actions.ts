"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getAttendeeByContactCode } from "@/lib/contact-requests";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConnectActionState = {
  status: "error";
  message: string;
};

/**
 * Nawiązanie kontaktu przez zeskanowany kod QR.
 *
 * Skan QR = fizyczna, obustronna obecność, więc kontakt powstaje OD RAZU jako
 * 'accepted' (nie 'pending' jak zdalna prośba z aplikacji).
 *
 * declined → accepted: skan NADPISUJE wcześniejszą odmowę. Obie osoby stoją
 * naprzeciw siebie i świadomie skanują — to silniejsza, świeższa zgoda niż
 * wcześniejsza zdalna odmowa. Granica jest CELOWA i dotyczy WYŁĄCZNIE tej
 * trasy: sendContactRequest (prośba z aplikacji) przy 'declined' zachowuje
 * dotychczasowe zachowanie i odmowy nie nadpisuje.
 *
 * BEZPIECZEŃSTWO: tożsamość skanującego WYŁĄCZNIE z getCurrentAttendee(slug)
 * (cookie). Z URL przychodzi tylko `code` — właściciel kodu ustalany
 * server-side, nigdy attendee_id z klienta.
 */
export async function connectViaCode(
  slug: string,
  code: string,
): Promise<ConnectActionState> {
  const scanner = await getCurrentAttendee(slug);
  if (!scanner) {
    return {
      status: "error",
      message: "Sesja wygasła. Wejdź ponownie przez swój link wejściowy.",
    };
  }

  const owner = await getAttendeeByContactCode(code, scanner.event_id);
  if (!owner) {
    return { status: "error", message: "Nieprawidłowy kod." };
  }

  if (owner.id === scanner.id) {
    return { status: "error", message: "To Twój kod." };
  }

  const supabase = createAdminClient();

  // Istniejący wiersz w DOWOLNYM kierunku (skaner→owner LUB owner→skaner) —
  // UNIQUE jest kierunkowy, więc sprawdzamy obie strony.
  const { data: existing } = await supabase
    .from("contact_requests")
    .select("id")
    .eq("event_id", scanner.event_id)
    .or(
      `and(requester_id.eq.${scanner.id},recipient_id.eq.${owner.id}),` +
        `and(requester_id.eq.${owner.id},recipient_id.eq.${scanner.id})`,
    )
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    // Upgrade dowolnego stanu (pending LUB declined) → accepted. Patrz komentarz
    // funkcji: skan nadpisuje odmowę.
    const { error } = await supabase
      .from("contact_requests")
      .update({ status: "accepted", responded_at: now })
      .eq("id", existing.id);

    if (error) {
      return {
        status: "error",
        message: "Nie udało się nawiązać kontaktu. Spróbuj ponownie.",
      };
    }
  } else {
    const { error } = await supabase.from("contact_requests").insert({
      event_id: scanner.event_id,
      requester_id: scanner.id,
      recipient_id: owner.id,
      status: "accepted",
      responded_at: now,
    });

    if (error) {
      return {
        status: "error",
        message: "Nie udało się nawiązać kontaktu. Spróbuj ponownie.",
      };
    }
  }

  revalidatePath(`/e/${slug}/contacts`);
  revalidatePath(`/e/${slug}/attendees`);
  redirect(`/e/${slug}/contacts`);
}
