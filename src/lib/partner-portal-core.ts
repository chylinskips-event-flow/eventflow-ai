// Panel partnera — czysta logika (bez I/O), testowalna jednostkowo i bezpieczna dla klienta.
// I/O: src/lib/partner-portal.ts.

export const PARTNER_NAME_MAX_LENGTH = 200;
export const PARTNER_DESCRIPTION_MAX_LENGTH = 5000;
export const PARTNER_OFFER_MAX_LENGTH = 2000;
export const PARTNER_URL_MAX_LENGTH = 500;
export const REVIEW_NOTE_MAX_LENGTH = 1000;
export const MATERIAL_TITLE_MAX_LENGTH = 200;
/** Limit body server actions to 6 MB (next.config) — zostawiamy zapas na resztę formularza. */
export const MATERIAL_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_MATERIALS_PER_PARTNER = 20;
export const INVITE_TTL_DAYS = 14;

export const MATERIAL_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};
export const MATERIAL_ACCEPT = Object.keys(MATERIAL_TYPES).join(",");

export const SOCIAL_KEYS = ["linkedin", "facebook", "instagram", "x", "youtube"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X (Twitter)",
  youtube: "YouTube",
};
export type SocialLinks = Partial<Record<SocialKey, string>>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return value && value.length <= 254 && EMAIL.test(value) ? value : null;
}

/** „a***@firma.pl” — na stronie zaproszenia (bez pełnego adresu dla posiadacza linku). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.charAt(0)}***@${domain}`;
}

export type AccessStatus = "active" | "invited" | "expired" | "revoked";

export function accessStatus(
  row: { revoked_at: string | null; user_id: string | null; invite_expires_at: string },
  now: number,
): AccessStatus {
  if (row.revoked_at) return "revoked";
  if (row.user_id) return "active";
  return new Date(row.invite_expires_at).getTime() > now ? "invited" : "expired";
}

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  active: "Aktywny",
  invited: "Zaproszony",
  expired: "Zaproszenie wygasło",
  revoked: "Unieważniony",
};

/**
 * URL podany przez partnera: dopuszczamy tylko http(s); brak schematu → https://.
 * Pusty → null (pole wyczyszczone). Zwraca błąd dla innych schematów (javascript: itp.).
 */
export function normalizeUrl(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: true, value: null };
  if (value.length > PARTNER_URL_MAX_LENGTH) return { ok: false };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
    if (!url.hostname.includes(".")) return { ok: false };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false };
  }
}

export type ProfileInput = {
  name: string;
  description: string | null;
  website_url: string | null;
  offer: string | null;
  social_links: SocialLinks;
};

function optionalText(raw: unknown, max: number, label: string): { value: string | null } | { error: string } {
  const value = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (value.length > max) return { error: `${label} może mieć najwyżej ${max} znaków.` };
  return { value: value || null };
}

/** Walidacja profilu z formularza partnera (get = FormData.get). */
export function validateProfileInput(
  get: (key: string) => unknown,
): { ok: true; profile: ProfileInput } | { ok: false; error: string } {
  const name = typeof get("name") === "string" ? (get("name") as string).trim() : "";
  if (!name) return { ok: false, error: "Podaj nazwę firmy." };
  if (name.length > PARTNER_NAME_MAX_LENGTH) {
    return { ok: false, error: `Nazwa może mieć najwyżej ${PARTNER_NAME_MAX_LENGTH} znaków.` };
  }
  const description = optionalText(get("description"), PARTNER_DESCRIPTION_MAX_LENGTH, "Opis");
  if ("error" in description) return { ok: false, error: description.error };
  const offer = optionalText(get("offer"), PARTNER_OFFER_MAX_LENGTH, "Oferta");
  if ("error" in offer) return { ok: false, error: offer.error };

  const website = normalizeUrl(get("website_url"));
  if (!website.ok) return { ok: false, error: "Nieprawidłowy adres strony www." };

  const social_links: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const url = normalizeUrl(get(`social_${key}`));
    if (!url.ok) return { ok: false, error: `Nieprawidłowy link: ${SOCIAL_LABELS[key]}.` };
    if (url.value) social_links[key] = url.value;
  }

  return {
    ok: true,
    profile: { name, description: description.value, website_url: website.value, offer: offer.value, social_links },
  };
}

/** social_links z jsonb — odporne na złe dane (tylko znane klucze i stringi http(s)). */
export function parseSocialLinks(raw: unknown): SocialLinks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) out[key] = v;
  }
  return out;
}

export type ProfileFields = ProfileInput & { logo_url: string | null };

export const PROFILE_FIELD_LABELS: Record<keyof ProfileFields, string> = {
  name: "Nazwa",
  logo_url: "Logo",
  description: "Opis",
  website_url: "Strona www",
  offer: "Oferta dla uczestników",
  social_links: "Social media",
};

/** Pola, które szkic zmienia względem opublikowanej wersji (do przeglądu organizatora). */
export function changedProfileFields(published: ProfileFields, draft: ProfileFields): (keyof ProfileFields)[] {
  const keys = Object.keys(PROFILE_FIELD_LABELS) as (keyof ProfileFields)[];
  return keys.filter((k) =>
    k === "social_links"
      ? JSON.stringify(sortObject(published.social_links)) !== JSON.stringify(sortObject(draft.social_links))
      : (published[k] ?? null) !== (draft[k] ?? null),
  );
}

function sortObject(o: SocialLinks): SocialLinks {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

/** Nazwa pliku do Storage: bez ścieżek i znaków spoza [a-z0-9._-], z zachowaniem rozszerzenia. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "plik";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120);
  return cleaned || "plik";
}

export function validateMaterialFile(
  file: { type: string; size: number; name: string } | null,
): { ok: true } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "Wybierz plik." };
  if (!MATERIAL_TYPES[file.type]) {
    return { ok: false, error: `Dozwolone formaty: ${Object.values(MATERIAL_TYPES).join(", ")}.` };
  }
  if (file.size > MATERIAL_MAX_BYTES) return { ok: false, error: "Maksymalny rozmiar pliku: 5 MB." };
  return { ok: true };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
