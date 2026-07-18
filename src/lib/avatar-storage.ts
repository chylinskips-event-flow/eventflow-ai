// Wspólne stałe/utility dla avatarów uczestników w Storage. Współdzielone przez
// upload (profile/actions) i usuwanie konta (attendee-deletion), żeby nazwa
// bucketa i format ścieżki miały jedno źródło prawdy.
export const AVATAR_BUCKET = "attendee-avatars";

// Ścieżka obiektu w bucketcie wyciągnięta z publicznego URL-a (bez ?v=...).
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}
