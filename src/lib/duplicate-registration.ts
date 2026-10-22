import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLike, requestAccessLinkForEmail } from "@/lib/access-link";
import { normalizeEmail } from "@/lib/access-link-core";

// Ponowna rejestracja tego samego adresu w TYM wydarzeniu (uczestnik oczekujący lub zatwierdzony)
// nie tworzy nowego rekordu — zamiast tego działa jak „Wejdź ponownie” (te same limity i mail
// z linkiem/listą linków). Odrzucony uczestnik może zarejestrować się ponownie, jak dotąd.

export const DUPLICATE_REGISTRATION_MESSAGE =
  "Ten adres jest już zarejestrowany na to wydarzenie. Wysłaliśmy link do Twojego panelu — sprawdź skrzynkę (także spam).";
export const DUPLICATE_REGISTRATION_ERROR_MESSAGE =
  "Ten adres jest już zarejestrowany na to wydarzenie. Nie udało się teraz wysłać linku — spróbuj „Wejdź ponownie” za chwilę.";

/** Statusy, które blokują ponowną rejestrację (bez „rejected”). */
export const ACTIVE_REGISTRATION_STATUSES = ["pending", "approved"] as const;

export async function hasActiveRegistration(eventId: string, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const { count, error } = await createAdminClient()
    .from("attendees")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", [...ACTIVE_REGISTRATION_STATUSES])
    .ilike("email", escapeLike(normalized));
  if (error) {
    // Awaria sprawdzenia nie blokuje rejestracji (gorszy byłby brak możliwości zapisu).
    console.error("[registration] duplicate check failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
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
  if (!(await hasActiveRegistration(params.eventId, params.email))) return null;
  const result = await requestAccessLinkForEmail({
    slug: params.slug,
    email: params.email,
    headers: params.headers,
  });
  return result.status === "error" ? DUPLICATE_REGISTRATION_ERROR_MESSAGE : DUPLICATE_REGISTRATION_MESSAGE;
}
