import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLike, requestAccessLinkForEmail } from "@/lib/access-link";
import { normalizeEmail } from "@/lib/access-link-core";

// Ponowna rejestracja tego samego adresu w TYM wydarzeniu (uczestnik oczekujący lub zatwierdzony)
// nie tworzy nowego rekordu. Zatwierdzony: działa jak „Wejdź ponownie” (te same limity i mail
// z linkiem/listą linków). Oczekujący: link do panelu jeszcze nie istnieje (wysyłamy go dopiero
// po zatwierdzeniu), więc tylko informujemy, że zgłoszenie czeka na organizatora — bez maila.
// Odrzucony uczestnik może zarejestrować się ponownie, jak dotąd.

export const DUPLICATE_REGISTRATION_MESSAGE =
  "Ten adres jest już zarejestrowany na to wydarzenie. Wysłaliśmy link do Twojego panelu — sprawdź skrzynkę (także spam).";
export const DUPLICATE_REGISTRATION_ERROR_MESSAGE =
  "Ten adres jest już zarejestrowany na to wydarzenie. Nie udało się teraz wysłać linku — spróbuj „Wejdź ponownie” za chwilę.";
export const DUPLICATE_PENDING_REGISTRATION_MESSAGE =
  "Ten adres jest już zarejestrowany na to wydarzenie, a zgłoszenie czeka na zatwierdzenie przez organizatora. Link do panelu wyślemy e-mailem po zatwierdzeniu.";

/** Statusy, które blokują ponowną rejestrację (bez „rejected”). */
export const ACTIVE_REGISTRATION_STATUSES = ["pending", "approved"] as const;

/**
 * Status aktywnej rejestracji adresu w wydarzeniu: "approved", gdy jest choć jeden zatwierdzony
 * rekord, "pending", gdy są tylko oczekujące, null — brak (lub błąd sprawdzenia).
 */
export async function getActiveRegistrationStatus(
  eventId: string,
  email: string,
): Promise<"approved" | "pending" | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data, error } = await createAdminClient()
    .from("attendees")
    .select("status")
    .eq("event_id", eventId)
    .in("status", [...ACTIVE_REGISTRATION_STATUSES])
    .ilike("email", escapeLike(normalized));
  if (error) {
    // Awaria sprawdzenia nie blokuje rejestracji (gorszy byłby brak możliwości zapisu).
    console.error("[registration] duplicate check failed:", error.message);
    return null;
  }
  const statuses = (data ?? []).map((r: { status: string }) => r.status);
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  return null;
}

export async function hasActiveRegistration(eventId: string, email: string): Promise<boolean> {
  return (await getActiveRegistrationStatus(eventId, email)) !== null;
}

/**
 * Zwraca komunikat dla uczestnika, jeśli adres jest już zarejestrowany w tym wydarzeniu
 * (i wtedy zleca wysyłkę linku), albo null — można tworzyć nowy rekord.
 */
export async function handleDuplicateRegistration(params: {
  eventId: string;
  slug: string;
  email: string;
  headers: Headers;
}): Promise<string | null> {
  const status = await getActiveRegistrationStatus(params.eventId, params.email);
  if (status === null) return null;
  if (status === "pending") return DUPLICATE_PENDING_REGISTRATION_MESSAGE;
  const result = await requestAccessLinkForEmail({
    slug: params.slug,
    email: params.email,
    headers: params.headers,
  });
  return result.status === "error" ? DUPLICATE_REGISTRATION_ERROR_MESSAGE : DUPLICATE_REGISTRATION_MESSAGE;
}
