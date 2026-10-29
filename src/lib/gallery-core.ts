// Galeria zdjęć z eventu — czysta logika (client-safe, testowalna): limity, walidacja plików,
// budżet miejsca, stan linku fotografa, komunikaty. Bez Supabase i bez sharp.

export const GALLERY_BUCKET = "event-photos";

export const MAX_PHOTOS_PER_EVENT = 500;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Ochrona pamięci funkcji: obrazy powyżej ~60 MP odrzucamy (typowy aparat to 24–45 MP). */
export const MAX_INPUT_PIXELS = 60_000_000;

export const DISPLAY_MAX_PX = 2560;
export const DISPLAY_QUALITY = 82;
export const THUMB_MAX_PX = 600;
export const THUMB_QUALITY = 72;

/** Porzucone rezerwacje („uploading”) sprzątamy po 2 h. */
export const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;
/** Limit zapytań na link fotografa: rezerwacje w oknie czasowym. */
export const LINK_RATE_WINDOW_MS = 10 * 60 * 1000;
export const LINK_RATE_MAX = 120;

/** Ważność podpisanych adresów (sekundy): podgląd/miniatury i pobranie. */
export const SIGNED_VIEW_TTL_S = 15 * 60;
export const SIGNED_DOWNLOAD_TTL_S = 60;

export const BUDGET_WARN_RATIO = 0.8;
export const DEFAULT_BUDGET_MB = 500;

export const DEFAULT_GALLERY_INFO_TEXT =
  "Zdjęcia z wydarzenia możesz oglądać i pobierać do użytku prywatnego. Jeśli nie chcesz być " +
  "na którymś zdjęciu, użyj przycisku „Zgłoś zdjęcie” — zdjęcie zostanie od razu ukryte, " +
  "a organizator zdecyduje o jego usunięciu.";

// ── Formaty ────────────────────────────────────────────────────────────────

export type PhotoExt = "jpg" | "png" | "webp" | "heic";

const MIME_TO_EXT: Record<string, PhotoExt> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Atrybut `accept` pola wyboru plików (rozszerzenia — Windows nie zna typu MIME HEIC). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

export const UNSUPPORTED_FORMAT_MESSAGE = "Nieobsługiwany format. Dozwolone: JPEG, PNG, WebP i HEIC.";

export type PhotoFileCheck =
  | { ok: true; contentType: string; ext: PhotoExt }
  | { ok: false; error: string };

/**
 * Walidacja pliku przed rezerwacją: rozmiar i format. Typ MIME z przeglądarki, a gdy jest pusty
 * albo ogólny (np. HEIC na Windows) — z rozszerzenia. Rzeczywisty format sprawdza dopiero serwer.
 */
export function validatePhotoFile(file: { name: string; type: string; size: number }): PhotoFileCheck {
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "Plik jest pusty." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Plik jest większy niż 15 MB." };

  const type = (file.type || "").toLowerCase();
  const extRaw = /\.([a-z0-9]+)$/i.exec(file.name || "")?.[1]?.toLowerCase() ?? "";

  let contentType: string | null = null;
  if (MIME_TO_EXT[type]) contentType = type;
  else if ((!type || type === "application/octet-stream") && EXT_TO_MIME[extRaw]) contentType = EXT_TO_MIME[extRaw];
  if (!contentType) return { ok: false, error: UNSUPPORTED_FORMAT_MESSAGE };

  return { ok: true, contentType, ext: MIME_TO_EXT[contentType] };
}

export const isSha256Hex = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

// ── Ścieżki w buckecie ─────────────────────────────────────────────────────

export function photoPaths(eventId: string, photoId: string, ext: PhotoExt) {
  const dir = `${eventId}/${photoId}`;
  return { original: `${dir}/original.${ext}`, display: `${dir}/display.jpg`, thumb: `${dir}/thumb.jpg` };
}

// ── Rezerwacja ─────────────────────────────────────────────────────────────

export type ReserveResult = "ok" | "duplicate" | "event_limit" | "link_invalid" | "link_limit";

export const RESERVE_MESSAGES: Record<Exclude<ReserveResult, "ok">, string> = {
  duplicate: "Pominięto — to zdjęcie jest już w galerii.",
  event_limit: `Osiągnięto limit ${MAX_PHOTOS_PER_EVENT} zdjęć dla wydarzenia.`,
  link_invalid: "Link do wgrywania jest nieaktywny.",
  link_limit: "Osiągnięto limit zdjęć dla tego linku.",
};

// ── Budżet miejsca (wszystkie galerie w projekcie) ─────────────────────────

/** Budżet w MB ze zmiennej GALLERY_STORAGE_BUDGET_MB (domyślnie 500). */
export function galleryBudgetMb(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_MB;
}

export type BudgetState = { usedBytes: number; budgetBytes: number; ratio: number; warn: boolean; blocked: boolean };

export function budgetState(usedBytes: number, budgetMb: number): BudgetState {
  const budgetBytes = budgetMb * 1024 * 1024;
  const ratio = budgetBytes > 0 ? usedBytes / budgetBytes : 1;
  return { usedBytes, budgetBytes, ratio, warn: ratio >= BUDGET_WARN_RATIO, blocked: ratio >= 1 };
}

export const BUDGET_BLOCKED_MESSAGE =
  "Brak miejsca na nowe zdjęcia — osiągnięto limit miejsca na galerie. Usuń zbędne zdjęcia albo skontaktuj się z obsługą Eventro.";

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString("pl-PL", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

// ── Link fotografa ─────────────────────────────────────────────────────────

export type UploadLinkState = "active" | "revoked" | "expired";

export function uploadLinkState(
  link: { revoked_at: string | null; expires_at: string | null },
  now: number,
): UploadLinkState {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && Date.parse(link.expires_at) <= now) return "expired";
  return "active";
}

export type LinkInput = { label: string; maxPhotos: number | null };

export function validateUploadLinkInput(label: unknown, maxPhotos: unknown): { ok: true; value: LinkInput } | { ok: false; error: string } {
  const l = typeof label === "string" ? label.trim() : "";
  if (l.length < 1 || l.length > 100) return { ok: false, error: "Podaj nazwę fotografa (do 100 znaków)." };
  const rawMax = typeof maxPhotos === "string" ? maxPhotos.trim() : "";
  if (!rawMax) return { ok: true, value: { label: l, maxPhotos: null } };
  const n = Number(rawMax);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PHOTOS_PER_EVENT) {
    return { ok: false, error: `Limit zdjęć musi być liczbą od 1 do ${MAX_PHOTOS_PER_EVENT}.` };
  }
  return { ok: true, value: { label: l, maxPhotos: n } };
}

// ── Znak wodny ─────────────────────────────────────────────────────────────

/** Logo w prawym dolnym rogu: szerokość ~12% zdjęcia (min. 80 px), margines ~3% krótszego boku. */
export function watermarkBox(width: number, height: number) {
  const logoWidth = Math.max(80, Math.round(width * 0.12));
  const margin = Math.max(12, Math.round(Math.min(width, height) * 0.03));
  return { logoWidth, logoMaxHeight: Math.round(Math.min(height * 0.25, logoWidth)), margin };
}

export const WATERMARK_OPACITY = 0.6;

// ── Widok uczestnika ───────────────────────────────────────────────────────

/** Miniatury w siatce uczestnika: tyle na stronę („Pokaż więcej”). */
export const PARTICIPANT_PAGE_SIZE = 48;

export type ParticipantGalleryState = "unavailable" | "not_checked_in" | "coming_soon" | "open";

/**
 * Stan galerii dla uczestnika. Kolejność ma znaczenie: uczestnik z innego eventu albo galeria
 * wyłączona / plan bez funkcji → „unavailable” (404, bez zdradzania czegokolwiek); brak
 * check-inu → komunikat bez liczby zdjęć; brak publikacji → „pojawi się wkrótce”.
 */
export function participantGalleryState(input: {
  eventId: string;
  attendeeEventId: string;
  checkedInAt: string | null;
  enabled: boolean;
  publishedAt: string | null;
  featureOn: boolean;
}): ParticipantGalleryState {
  if (input.attendeeEventId !== input.eventId) return "unavailable";
  if (!input.featureOn || !input.enabled) return "unavailable";
  if (!input.checkedInAt) return "not_checked_in";
  if (!input.publishedAt) return "coming_soon";
  return "open";
}

/** Nazwa pobieranego pliku: slug eventu + krótki identyfikator zdjęcia. */
export function photoDownloadName(slug: string, photoId: string): string {
  const base = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "wydarzenie";
  return `${base}-zdjecie-${photoId.replace(/[^0-9a-f]/gi, "").slice(0, 8)}.jpg`;
}

// ── Zgłoszenia zdjęć ───────────────────────────────────────────────────────

export type ReportKind = "remove_me" | "other";
export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  remove_me: "Nie chcę być na tym zdjęciu",
  other: "Inny powód",
};
export const REPORT_MESSAGE_MAX = 500;
/** Limit zgłoszeń jednej osoby w oknie 24 h (ochrona przed masowym ukrywaniem galerii). */
export const REPORT_RATE_MAX = 20;
export const REPORT_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function validateReportInput(
  kind: unknown,
  message: unknown,
): { ok: true; value: { kind: ReportKind; message: string | null } } | { ok: false; error: string } {
  if (kind !== "remove_me" && kind !== "other") return { ok: false, error: "Wybierz powód zgłoszenia." };
  const m = typeof message === "string" ? message.trim() : "";
  if (m.length > REPORT_MESSAGE_MAX) return { ok: false, error: `Wiadomość może mieć do ${REPORT_MESSAGE_MAX} znaków.` };
  if (kind === "other" && !m) return { ok: false, error: "Opisz krótko powód zgłoszenia." };
  return { ok: true, value: { kind, message: m || null } };
}

export const REPORT_MESSAGES = {
  done: "Dziękujemy — zdjęcie zostało ukryte do decyzji organizatora.",
  already: "To zdjęcie jest już zgłoszone — czeka na decyzję organizatora.",
  resolved: "To zdjęcie było już zgłoszone i organizator zdecydował, że zostaje.",
  limit: "Osiągnięto limit zgłoszeń na dziś. Jeśli potrzebujesz pomocy, skontaktuj się z organizatorem.",
} as const;
