// Galeria zdjęć z eventu — dostęp do danych i przepływ uploadu (service_role).
// Tabele galerii mają RLS deny-all: organizator przechodzi przez getOwnEvent() w akcjach,
// fotograf przez resolveUploadLink(token). Same funkcje poniżej (poza resolveUploadLink)
// NIE autoryzują — wywołujący musi to zrobić wcześniej.
// Nie logujemy adresów podpisanych ani danych osobowych.
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import {
  BUDGET_BLOCKED_MESSAGE,
  DEFAULT_GALLERY_INFO_TEXT,
  GALLERY_BUCKET,
  LINK_RATE_MAX,
  LINK_RATE_WINDOW_MS,
  MAX_PHOTOS_PER_EVENT,
  MAX_PHOTO_BYTES,
  RESERVE_MESSAGES,
  SIGNED_VIEW_TTL_S,
  STALE_UPLOAD_MS,
  budgetState,
  galleryBudgetMb,
  isSha256Hex,
  photoPaths,
  uploadLinkState,
  validatePhotoFile,
  type BudgetState,
  type PhotoExt,
  type ReserveResult,
} from "@/lib/gallery-core";
import { PhotoProcessingError, processPhoto } from "@/lib/gallery-image";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// ── Typy ───────────────────────────────────────────────────────────────────

export type GallerySettings = {
  enabled: boolean;
  watermark_enabled: boolean;
  info_text: string | null;
  published_at: string | null;
};

export type GalleryPhoto = {
  id: string;
  status: "uploading" | "ready" | "failed";
  hidden: boolean;
  width: number | null;
  height: number | null;
  size_bytes: number;
  watermarked: boolean;
  upload_link_id: string | null;
  created_at: string;
  thumb_url: string | null;
};

export type UploadLink = {
  id: string;
  event_id: string;
  label: string;
  token: string;
  expires_at: string | null;
  max_photos: number | null;
  revoked_at: string | null;
  created_at: string;
};

export type GalleryEvent = { id: string; organization_id: string; name: string; logo_url: string | null };

export type UploadActor = { kind: "organizer"; userId: string } | { kind: "link"; link: UploadLink };

export const DEFAULT_GALLERY_SETTINGS: GallerySettings = {
  enabled: false,
  watermark_enabled: true,
  info_text: null,
  published_at: null,
};

export const galleryInfoText = (s: GallerySettings) => s.info_text?.trim() || DEFAULT_GALLERY_INFO_TEXT;

// ── Odczyty ────────────────────────────────────────────────────────────────

export async function getGallerySettings(eventId: string): Promise<GallerySettings> {
  const { data } = await createAdminClient()
    .from("event_gallery_settings")
    .select("enabled, watermark_enabled, info_text, published_at")
    .eq("event_id", eventId)
    .maybeSingle();
  return (data as GallerySettings | null) ?? DEFAULT_GALLERY_SETTINGS;
}

/** Zdjęcia gotowe (ready) z podpisanymi adresami miniatur — widok organizatora. */
export async function listOrganizerPhotos(eventId: string): Promise<GalleryPhoto[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_photos")
    .select("id, status, hidden, width, height, size_bytes, watermarked, upload_link_id, created_at, thumb_path")
    .eq("event_id", eventId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as (Omit<GalleryPhoto, "thumb_url"> & { thumb_path: string })[];
  const urls = await signedUrls(rows.map((r) => r.thumb_path), SIGNED_VIEW_TTL_S);
  return rows.map(({ thumb_path, ...r }) => ({ ...r, size_bytes: Number(r.size_bytes), thumb_url: urls.get(thumb_path) ?? null }));
}

async function signedUrls(paths: string[], ttl: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await createAdminClient().storage.from(GALLERY_BUCKET).createSignedUrls(paths, ttl);
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

export type GalleryUsage = { count: number; eventBytes: number; budget: BudgetState };

/** Licznik eventu (zdjęcia / miejsce) + zajętość wszystkich galerii względem budżetu. */
export async function getGalleryUsage(eventId: string): Promise<GalleryUsage> {
  const admin = createAdminClient();
  const { data } = await admin.from("event_photos").select("event_id, status, size_bytes, original_bytes");
  let count = 0;
  let eventBytes = 0;
  let totalBytes = 0;
  for (const r of (data ?? []) as { event_id: string; status: string; size_bytes: number; original_bytes: number }[]) {
    // Pliki w drodze liczymy rozmiarem oryginału (zajmują miejsce do przetworzenia).
    const bytes = r.status === "uploading" ? Number(r.original_bytes) : r.status === "ready" ? Number(r.size_bytes) : 0;
    totalBytes += bytes;
    if (r.event_id === eventId && r.status !== "failed") {
      count += 1;
      eventBytes += bytes;
    }
  }
  return { count, eventBytes, budget: budgetState(totalBytes, galleryBudgetMb(process.env.GALLERY_STORAGE_BUDGET_MB)) };
}

export async function listUploadLinks(eventId: string): Promise<(UploadLink & { photo_count: number })[]> {
  const admin = createAdminClient();
  const [{ data: links }, { data: photos }] = await Promise.all([
    admin.from("gallery_upload_links").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    admin.from("event_photos").select("upload_link_id").eq("event_id", eventId).eq("status", "ready").not("upload_link_id", "is", null),
  ]);
  const counts = new Map<string, number>();
  for (const p of (photos ?? []) as { upload_link_id: string }[]) counts.set(p.upload_link_id, (counts.get(p.upload_link_id) ?? 0) + 1);
  return ((links ?? []) as UploadLink[]).map((l) => ({ ...l, photo_count: counts.get(l.id) ?? 0 }));
}

// ── Link fotografa ─────────────────────────────────────────────────────────

/**
 * Walidacja linku fotografa. null (→ strona „link nieaktywny” / błąd akcji), gdy: zły format,
 * link unieważniony lub przeterminowany, event usunięty lub zarchiwizowany, event/organizacja
 * zawieszone, plan bez funkcji event_photos.
 */
export async function resolveUploadLink(token: string): Promise<{ link: UploadLink; event: GalleryEvent } | null> {
  if (!isUuid(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("gallery_upload_links")
    .select("*, events!inner(id, organization_id, name, logo_url, status, deleted_at)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const { events, ...link } = data as unknown as UploadLink & {
    events: GalleryEvent & { status: string; deleted_at: string | null };
  };
  if (uploadLinkState(link, Date.now()) !== "active") return null;
  if (events.deleted_at || events.status === "archived") return null;

  const [eventSus, orgSus, enabled] = await Promise.all([
    admin.from("event_suspensions").select("event_id").eq("event_id", events.id).maybeSingle(),
    admin.from("organization_suspensions").select("organization_id").eq("organization_id", events.organization_id).maybeSingle(),
    hasFeature(events.organization_id, "event_photos"),
  ]);
  if (eventSus.data || orgSus.data || !enabled) return null;

  return {
    link,
    event: { id: events.id, organization_id: events.organization_id, name: events.name, logo_url: events.logo_url },
  };
}

// ── Upload: rezerwacja + podpisany adres ───────────────────────────────────

export type PhotoMeta = { name: string; type: string; size: number; hash: string };

export type StartUploadResult =
  | { ok: true; photoId: string; signedUrl: string; contentType: string }
  | { ok: false; error: string; skipped?: boolean };

/** Sprząta porzucone rezerwacje eventu (wiersz + plik oryginału, jeśli dotarł). */
export async function sweepStaleUploads(eventId: string): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const { data } = await admin
    .from("event_photos")
    .select("id, original_path")
    .eq("event_id", eventId)
    .eq("status", "uploading")
    .lt("created_at", cutoff);
  const rows = (data ?? []) as { id: string; original_path: string | null }[];
  if (rows.length === 0) return;
  const paths = rows.map((r) => r.original_path).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from(GALLERY_BUCKET).remove(paths);
  await admin.from("event_photos").delete().in("id", rows.map((r) => r.id));
}

export async function startPhotoUpload(eventId: string, actor: UploadActor, input: PhotoMeta): Promise<StartUploadResult> {
  // Dane z przeglądarki — normalizujemy typy, zanim cokolwiek sprawdzimy.
  const meta: PhotoMeta = {
    name: String(input?.name ?? "").slice(0, 255),
    type: String(input?.type ?? "").slice(0, 100),
    size: Number(input?.size),
    hash: String(input?.hash ?? ""),
  };
  const file = validatePhotoFile(meta);
  if (!file.ok) return { ok: false, error: file.error };
  if (!isSha256Hex(meta.hash)) return { ok: false, error: "Nie udało się odczytać pliku." };

  const admin = createAdminClient();
  const linkId = actor.kind === "link" ? actor.link.id : null;

  if (linkId) {
    const since = new Date(Date.now() - LINK_RATE_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("event_photos")
      .select("id", { count: "exact", head: true })
      .eq("upload_link_id", linkId)
      .gte("created_at", since);
    if ((count ?? 0) >= LINK_RATE_MAX) return { ok: false, error: "Zbyt wiele zdjęć naraz. Odczekaj kilka minut i spróbuj ponownie." };
  }

  await sweepStaleUploads(eventId);

  const usage = await getGalleryUsage(eventId);
  if (usage.budget.blocked) return { ok: false, error: BUDGET_BLOCKED_MESSAGE };

  const { data, error } = await admin.rpc("reserve_event_photo", {
    p_event_id: eventId,
    p_upload_link_id: linkId,
    p_uploaded_by: actor.kind === "organizer" ? actor.userId : null,
    p_content_hash: meta.hash,
    p_original_bytes: meta.size,
    p_max_per_event: MAX_PHOTOS_PER_EVENT,
  });
  if (error) return { ok: false, error: "Nie udało się przygotować wysyłki. Spróbuj ponownie." };
  const row = (Array.isArray(data) ? data[0] : data) as { photo_id: string | null; result: ReserveResult } | undefined;
  if (!row) return { ok: false, error: "Nie udało się przygotować wysyłki. Spróbuj ponownie." };

  let photoId = row.photo_id;
  if (row.result === "duplicate") {
    // Ponowienie przerwanego uploadu tego samego pliku przez tego samego wgrywającego.
    photoId = await findResumableUpload(eventId, meta.hash, actor);
    if (!photoId) return { ok: false, error: RESERVE_MESSAGES.duplicate, skipped: true };
  } else if (row.result !== "ok" || !photoId) {
    return { ok: false, error: RESERVE_MESSAGES[row.result as Exclude<ReserveResult, "ok">] ?? "Nie udało się przygotować wysyłki." };
  }

  const path = photoPaths(eventId, photoId, file.ext).original;
  await admin.from("event_photos").update({ original_path: path, original_bytes: meta.size }).eq("id", photoId);

  const { data: signed, error: signError } = await admin.storage.from(GALLERY_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (signError || !signed) return { ok: false, error: "Nie udało się przygotować wysyłki. Spróbuj ponownie." };

  return { ok: true, photoId, signedUrl: signed.signedUrl, contentType: file.contentType };
}

async function findResumableUpload(eventId: string, hash: string, actor: UploadActor): Promise<string | null> {
  let q = createAdminClient()
    .from("event_photos")
    .select("id")
    .eq("event_id", eventId)
    .eq("content_hash", hash)
    .eq("status", "uploading");
  q = actor.kind === "link" ? q.eq("upload_link_id", actor.link.id) : q.eq("uploaded_by", actor.userId);
  const { data } = await q.maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ── Upload: przetworzenie ──────────────────────────────────────────────────

export type FinalizeResult = { ok: true } | { ok: false; error: string };

/** Logo organizatora tylko z naszego Supabase (publiczny bucket logo), z limitem czasu i rozmiaru. */
async function loadLogo(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const allowed = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    const url = new URL(logoUrl);
    if (!allowed || url.host !== allowed || url.protocol !== "https:") return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= 5 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

async function markFailed(photoId: string, originalPath: string | null) {
  const admin = createAdminClient();
  if (originalPath) await admin.storage.from(GALLERY_BUCKET).remove([originalPath]);
  await admin.from("event_photos").update({ status: "failed", original_path: null }).eq("id", photoId);
}

export async function finalizePhotoUpload(event: GalleryEvent, photoId: string, actor: UploadActor): Promise<FinalizeResult> {
  if (!isUuid(photoId)) return { ok: false, error: "Zdjęcie nie istnieje." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_photos")
    .select("id, event_id, status, original_path, content_hash, upload_link_id, uploaded_by")
    .eq("id", photoId)
    .eq("event_id", event.id)
    .maybeSingle();
  const row = data as {
    id: string;
    status: string;
    original_path: string | null;
    content_hash: string;
    upload_link_id: string | null;
    uploaded_by: string | null;
  } | null;
  if (!row || row.status !== "uploading" || !row.original_path) return { ok: false, error: "Zdjęcie nie istnieje." };
  // Fotograf przetwarza tylko zdjęcia z własnego linku.
  if (actor.kind === "link" && row.upload_link_id !== actor.link.id) return { ok: false, error: "Zdjęcie nie istnieje." };

  const { data: blob, error: dlError } = await admin.storage.from(GALLERY_BUCKET).download(row.original_path);
  if (dlError || !blob) return { ok: false, error: "Plik nie dotarł do serwera. Spróbuj ponownie." };
  const original = Buffer.from(await blob.arrayBuffer());

  if (original.length === 0 || original.length > MAX_PHOTO_BYTES) {
    await markFailed(row.id, row.original_path);
    return { ok: false, error: "Plik jest pusty albo większy niż 15 MB." };
  }
  if (createHash("sha256").update(original).digest("hex") !== row.content_hash) {
    await markFailed(row.id, row.original_path);
    return { ok: false, error: "Plik uszkodzony w trakcie wysyłki. Spróbuj ponownie." };
  }

  const settings = await getGallerySettings(event.id);
  let processed;
  try {
    processed = await processPhoto(original, {
      watermark: settings.watermark_enabled,
      logo: settings.watermark_enabled ? await loadLogo(event.logo_url) : null,
    });
  } catch (e) {
    await markFailed(row.id, row.original_path);
    return { ok: false, error: e instanceof PhotoProcessingError ? e.message : "Nie udało się przetworzyć zdjęcia." };
  }

  const paths = photoPaths(event.id, row.id, "jpg" as PhotoExt);
  const bucket = admin.storage.from(GALLERY_BUCKET);
  const [d, t] = await Promise.all([
    bucket.upload(paths.display, processed.display, { contentType: "image/jpeg", upsert: true }),
    bucket.upload(paths.thumb, processed.thumb, { contentType: "image/jpeg", upsert: true }),
  ]);
  if (d.error || t.error) {
    await bucket.remove([paths.display, paths.thumb]);
    return { ok: false, error: "Nie udało się zapisać zdjęcia. Spróbuj ponownie." };
  }

  const { error: upError } = await admin
    .from("event_photos")
    .update({
      status: "ready",
      display_path: paths.display,
      thumb_path: paths.thumb,
      width: processed.width,
      height: processed.height,
      size_bytes: processed.display.length + processed.thumb.length,
      watermarked: processed.watermarked,
      original_path: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (upError) return { ok: false, error: "Nie udało się zapisać zdjęcia. Spróbuj ponownie." };

  // Oryginału nie przechowujemy po przetworzeniu.
  await bucket.remove([row.original_path]);
  return { ok: true };
}

// ── Zarządzanie (organizator) ──────────────────────────────────────────────

export async function setPhotosHidden(eventId: string, ids: string[], hidden: boolean): Promise<boolean> {
  const valid = Array.isArray(ids) ? ids.filter(isUuid).slice(0, 500) : [];
  if (valid.length === 0) return false;
  const { error } = await createAdminClient().from("event_photos").update({ hidden: hidden === true }).eq("event_id", eventId).in("id", valid);
  return !error;
}

export async function deletePhotos(eventId: string, ids: string[]): Promise<boolean> {
  const valid = Array.isArray(ids) ? ids.filter(isUuid).slice(0, 500) : [];
  if (valid.length === 0) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_photos")
    .select("id, original_path, display_path, thumb_path")
    .eq("event_id", eventId)
    .in("id", valid);
  const rows = (data ?? []) as { id: string; original_path: string | null; display_path: string | null; thumb_path: string | null }[];
  if (rows.length === 0) return false;
  const paths = rows.flatMap((r) => [r.original_path, r.display_path, r.thumb_path]).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from(GALLERY_BUCKET).remove(paths);
  const { error } = await admin.from("event_photos").delete().eq("event_id", eventId).in("id", rows.map((r) => r.id));
  return !error;
}

export async function saveGallerySettings(eventId: string, patch: Partial<GallerySettings>): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("event_gallery_settings")
    .upsert({ event_id: eventId, ...patch }, { onConflict: "event_id" });
  return !error;
}
