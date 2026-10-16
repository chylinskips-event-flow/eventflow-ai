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

/**
 * Litery, których NFKD nie rozkłada na literę + znak diakrytyczny (np. „ł” zostawało usunięte:
 * „Łódź” → „odz”) — zamieniamy je ręcznie przed normalizacją.
 */
const TRANSLITERATION: Record<string, string> = {
  ł: "l",
  đ: "d",
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  þ: "th",
  ð: "d",
  ı: "i",
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[łđøæœßþðı]/g, (ch) => TRANSLITERATION[ch] ?? ch)
    .normalize("NFKD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Porządkowanie wpisu na bieżąco (pole adresu): jak slugify, ale bez obcinania myślnika na
 * końcu — inaczej nie dałoby się wpisać „moj-event” (myślnik znikał po każdym klawiszu).
 * Ostateczne porządkowanie (końcowy myślnik) robi slugify przy zapisie / opuszczeniu pola.
 */
export function sanitizeSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[łđøæœßþðı]/g, (ch) => TRANSLITERATION[ch] ?? ch)
    .normalize("NFKD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

/** Slug z nazwy; pusta lub nielatynowa nazwa → bezpieczna wartość zastępcza. */
export function slugFromName(name: string, fallback: string): string {
  return slugify(name) || fallback;
}

/**
 * Kolejny kandydat przy kolizji: 1 → sam `base`, 2 → `base-2`, 3 → `base-3`…
 * Base skracany tak, żeby całość mieściła się w limicie długości (etykieta DNS).
 */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base.slice(0, SLUG_MAX_LENGTH);
  const suffix = `-${attempt}`;
  return `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
}
