// Wspólne stałe/utility dla avatarów uczestników w Storage. Współdzielone przez
// upload (profile/actions) i usuwanie konta (attendee-deletion), żeby nazwa
// bucketa i format ścieżki miały jedno źródło prawdy.
export const AVATAR_BUCKET = "attendee-avatars";

/** Rozszerzenia, w jakich zapisujemy avatary (po sanityzacji: JPEG/PNG/WebP). */
export const AVATAR_EXTENSIONS = ["jpg", "png", "webp"] as const;

// Ścieżka obiektu w bucketcie wyciągnięta z publicznego URL-a (bez ?v=...).
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}

/** Wszystkie ścieżki, pod którymi aplikacja może zapisać avatar danego uczestnika. */
export function avatarPathsFor(eventId: string, attendeeId: string): string[] {
  return AVATAR_EXTENSIONS.map((ext) => `${eventId}/${attendeeId}.${ext}`);
}

/**
 * Ścieżka avatara z avatar_url, ale WYŁĄCZNIE gdy wskazuje plik tego uczestnika
 * ("<event_id>/<attendee_id>.<ext>"). Treść kolumny avatar_url nie jest źródłem
 * prawdy o tym, który plik należy do uczestnika, więc przed usunięciem pliku
 * (service_role) sprawdzamy ją z identyfikatorami z bazy — inna ścieżka → null.
 */
export function ownedAvatarPath(url: string | null | undefined, eventId: string, attendeeId: string): string | null {
  if (!url || !eventId || !attendeeId) return null;
  const path = storagePathFromPublicUrl(url);
  if (!path) return null;
  return avatarPathsFor(eventId, attendeeId).includes(path) ? path : null;
}
