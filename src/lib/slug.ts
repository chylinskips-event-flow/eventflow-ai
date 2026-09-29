export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Maksymalna długość etykiety DNS (RFC 1035). */
export const SLUG_MAX_LENGTH = 63;

/**
 * Subdomeny zarezerwowane — nie mogą być slugiem eventu.
 * Musi być zsynchronizowane z listą RESERVED w middleware.ts.
 */
export const RESERVED_SLUGS = new Set([
  "www", "admin", "app", "api", "mail", "send", "rsend",
  "autoconfig", "autodiscover", "static", "assets", "cdn",
  "_domainkey", "resend",
]);

/**
 * Waliduje slug przed zapisem do bazy.
 * Zwraca komunikat błędu lub null gdy slug jest poprawny.
 */
export function validateSlug(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) {
    return "Adres może zawierać tylko małe litery, cyfry i myślniki (np. moj-event).";
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return `Adres może mieć maksymalnie ${SLUG_MAX_LENGTH} znaków.`;
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `Adres „${slug}" jest zarezerwowany i nie może być użyty.`;
  }
  return null;
}

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}
