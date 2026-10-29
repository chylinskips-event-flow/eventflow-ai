// Galeria — widok uczestnika i zgłoszenia zdjęć (service_role).
// Granica bezpieczeństwa: uczestnik wyłącznie z getCurrentAttendee(slug) (cookie z tokenem,
// zweryfikowanym względem eventu), attendee_id NIGDY z przeglądarki. Każda operacja na zdjęciu
// sprawdza, że zdjęcie należy do eventu z kontekstu i jest widoczne (gotowe, nieukryte,
// bez otwartego zgłoszenia). Nie logujemy treści zgłoszeń ani adresów podpisanych.
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventBySlugForRegistration } from "@/lib/events";
import type { Attendee } from "@/lib/attendees";
import type { Event } from "@/lib/events";
import {
  GALLERY_BUCKET,
  PARTICIPANT_PAGE_SIZE,
  REPORT_MESSAGES,
  REPORT_RATE_MAX,
  REPORT_RATE_WINDOW_MS,
  SIGNED_DOWNLOAD_TTL_S,
  SIGNED_VIEW_TTL_S,
  participantGalleryState,
  validateReportInput,
  type ReportKind,
} from "@/lib/gallery-core";
import { getGallerySettings, isUuid, signedUrls, type GallerySettings } from "@/lib/gallery";

// ── Kontekst i dostęp ──────────────────────────────────────────────────────

export type ParticipantGalleryContext =
  | { state: "no_session" }
  | { state: "unavailable" }
  | { state: "not_checked_in" | "coming_soon"; event: Event }
  | { state: "open"; event: Event; attendee: Attendee; settings: GallerySettings };

/** Stan galerii dla zalogowanego uczestnika i danego eventu (bez cookie — testowalne). */
export async function galleryContextFor(
  event: Event,
  attendee: Attendee,
): Promise<ParticipantGalleryContext> {
  const [settings, featureOn] = await Promise.all([
    getGallerySettings(event.id),
    hasFeature(event.organization_id, "event_photos"),
  ]);
  const state = participantGalleryState({
    eventId: event.id,
    attendeeEventId: attendee.event_id,
    checkedInAt: attendee.checked_in_at,
    enabled: settings.enabled,
    publishedAt: settings.published_at,
    featureOn,
  });
  if (state === "unavailable") return { state };
  if (state === "open") return { state, event, attendee, settings };
  return { state, event };
}

/** Kontekst z cookie uczestnika — strona /e/[slug]/zdjecia i każda akcja galerii. */
export async function resolveParticipantGallery(slug: string): Promise<ParticipantGalleryContext> {
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) return { state: "no_session" };
  const event = await getEventBySlugForRegistration(slug);
  if (!event) return { state: "unavailable" };
  return galleryContextFor(event, attendee);
}

/** Czy pokazać pozycję „Zdjęcia” w menu (tylko po check-inie i publikacji). */
export async function canSeeGallery(event: Event | null, attendee: Attendee): Promise<boolean> {
  if (!event || !attendee.checked_in_at) return false;
  return (await galleryContextFor(event, attendee)).state === "open";
}

// ── Widoczne zdjęcia ───────────────────────────────────────────────────────

type VisibleRow = { id: string; thumb_path: string; width: number | null; height: number | null };

/** Gotowe, nieukryte, bez otwartego zgłoszenia — od najnowszych. */
async function visiblePhotoRows(eventId: string): Promise<VisibleRow[]> {
  const admin = createAdminClient();
  const [{ data: photos }, { data: pending }] = await Promise.all([
    admin
      .from("event_photos")
      .select("id, thumb_path, width, height")
      .eq("event_id", eventId)
      .eq("status", "ready")
      .eq("hidden", false)
      .order("created_at", { ascending: false }),
    admin.from("event_photo_reports").select("photo_id").eq("event_id", eventId).eq("status", "pending"),
  ]);
  const blocked = new Set(((pending ?? []) as { photo_id: string | null }[]).map((r) => r.photo_id));
  return ((photos ?? []) as VisibleRow[]).filter((p) => !blocked.has(p.id));
}

/** Pojedyncze widoczne zdjęcie tego eventu albo null (cudze / ukryte / zgłoszone / nie istnieje). */
async function visiblePhoto(eventId: string, photoId: string): Promise<{ id: string; display_path: string } | null> {
  if (!isUuid(photoId)) return null;
  const admin = createAdminClient();
  const [{ data: photo }, { data: pending }] = await Promise.all([
    admin
      .from("event_photos")
      .select("id, display_path, hidden, status")
      .eq("id", photoId)
      .eq("event_id", eventId)
      .maybeSingle(),
    admin.from("event_photo_reports").select("id").eq("photo_id", photoId).eq("status", "pending"),
  ]);
  const row = photo as { id: string; display_path: string | null; hidden: boolean; status: string } | null;
  if (!row || row.status !== "ready" || row.hidden || !row.display_path) return null;
  if (((pending ?? []) as unknown[]).length > 0) return null;
  return { id: row.id, display_path: row.display_path };
}

export type ParticipantPhoto = {
  id: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  /** Uczestnik oznaczył się „To ja”. */
  mine: boolean;
  /** Uczestnik może zgłosić (nie zgłaszał wcześniej tego zdjęcia). */
  reportable: boolean;
};

export type ParticipantPhotoPage = { photos: ParticipantPhoto[]; total: number; mineTotal: number; nextOffset: number | null };

export async function listParticipantPhotos(
  eventId: string,
  attendeeId: string,
  opts: { mine?: boolean; offset?: number } = {},
): Promise<ParticipantPhotoPage> {
  const admin = createAdminClient();
  const [rows, { data: tags }, { data: reports }] = await Promise.all([
    visiblePhotoRows(eventId),
    admin.from("event_photo_tags").select("photo_id").eq("attendee_id", attendeeId),
    admin.from("event_photo_reports").select("photo_id").eq("event_id", eventId).eq("attendee_id", attendeeId),
  ]);
  const tagged = new Set(((tags ?? []) as { photo_id: string }[]).map((t) => t.photo_id));
  const reported = new Set(((reports ?? []) as { photo_id: string | null }[]).map((r) => r.photo_id));
  const mineRows = rows.filter((r) => tagged.has(r.id));
  const list = opts.mine ? mineRows : rows;

  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const page = list.slice(offset, offset + PARTICIPANT_PAGE_SIZE);
  const urls = await signedUrls(page.map((r) => r.thumb_path), SIGNED_VIEW_TTL_S);
  return {
    photos: page.map((r) => ({
      id: r.id,
      thumbUrl: urls.get(r.thumb_path) ?? null,
      width: r.width,
      height: r.height,
      mine: tagged.has(r.id),
      reportable: !reported.has(r.id),
    })),
    total: rows.length,
    mineTotal: mineRows.length,
    nextOffset: offset + PARTICIPANT_PAGE_SIZE < list.length ? offset + PARTICIPANT_PAGE_SIZE : null,
  };
}

/**
 * Podpisany adres wersji display (ze znakiem wodnym): podgląd 15 min albo pobranie 60 s.
 * Ukryte / zgłoszone zdjęcie nie dostaje nowego adresu; wydane wcześniej wygasają po swojej ważności.
 */
export async function getParticipantPhotoUrl(
  eventId: string,
  photoId: string,
  mode: "view" | "download",
  downloadName?: string,
): Promise<string | null> {
  const photo = await visiblePhoto(eventId, photoId);
  if (!photo) return null;
  const bucket = createAdminClient().storage.from(GALLERY_BUCKET);
  const { data } =
    mode === "download"
      ? await bucket.createSignedUrl(photo.display_path, SIGNED_DOWNLOAD_TTL_S, { download: downloadName || true })
      : await bucket.createSignedUrl(photo.display_path, SIGNED_VIEW_TTL_S);
  return data?.signedUrl ?? null;
}

/** „To ja” — wyłącznie dla siebie (attendeeId z sesji). Oznaczyć można tylko widoczne zdjęcie. */
export async function setPhotoTag(eventId: string, attendeeId: string, photoId: string, on: boolean): Promise<boolean> {
  if (!isUuid(photoId)) return false;
  const admin = createAdminClient();
  if (!on) {
    const { error } = await admin.from("event_photo_tags").delete().eq("photo_id", photoId).eq("attendee_id", attendeeId);
    return !error;
  }
  if (!(await visiblePhoto(eventId, photoId))) return false;
  const { error } = await admin
    .from("event_photo_tags")
    .upsert({ photo_id: photoId, attendee_id: attendeeId }, { onConflict: "photo_id,attendee_id", ignoreDuplicates: true });
  return !error;
}

// ── Zgłoszenia: uczestnik ──────────────────────────────────────────────────

export type ReportResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Jedno zgłoszenie na parę zdjęcie + uczestnik: ponowne, gdy otwarte → „już zgłoszone”;
 * po decyzji organizatora („Zostaw”) ta sama osoba nie zgłosi zdjęcia drugi raz.
 * Otwarte zgłoszenie od razu ukrywa zdjęcie przed wszystkimi uczestnikami (visiblePhotoRows).
 */
export async function reportPhoto(
  eventId: string,
  attendeeId: string,
  photoId: string,
  kind: unknown,
  message: unknown,
): Promise<ReportResult> {
  const input = validateReportInput(kind, message);
  if (!input.ok) return { ok: false, error: input.error };
  if (!isUuid(photoId)) return { ok: false, error: "Zdjęcie nie istnieje." };

  const admin = createAdminClient();
  const [{ data: photo }, { data: existing }] = await Promise.all([
    admin.from("event_photos").select("id, status, hidden").eq("id", photoId).eq("event_id", eventId).maybeSingle(),
    admin.from("event_photo_reports").select("status").eq("photo_id", photoId).eq("attendee_id", attendeeId),
  ]);
  const p = photo as { id: string; status: string; hidden: boolean } | null;
  if (!p || p.status !== "ready" || p.hidden) return { ok: false, error: "Zdjęcie nie istnieje." };

  const statuses = ((existing ?? []) as { status: string }[]).map((r) => r.status);
  if (statuses.includes("pending")) return { ok: true, message: REPORT_MESSAGES.already };
  if (statuses.length > 0) return { ok: false, error: REPORT_MESSAGES.resolved };

  const since = new Date(Date.now() - REPORT_RATE_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("event_photo_reports")
    .select("id", { count: "exact", head: true })
    .eq("attendee_id", attendeeId)
    .gte("created_at", since);
  if ((count ?? 0) >= REPORT_RATE_MAX) return { ok: false, error: REPORT_MESSAGES.limit };

  const { error } = await admin.from("event_photo_reports").insert({
    event_id: eventId,
    photo_id: photoId,
    attendee_id: attendeeId,
    kind: input.value.kind,
    message: input.value.message,
  });
  if (error) {
    // Wyścig dwóch kliknięć: unikalny indeks otwartego zgłoszenia (photo_id, attendee_id).
    if ((error as { code?: string }).code === "23505") return { ok: true, message: REPORT_MESSAGES.already };
    return { ok: false, error: "Nie udało się wysłać zgłoszenia. Spróbuj ponownie." };
  }
  return { ok: true, message: REPORT_MESSAGES.done };
}

// ── Zgłoszenia: organizator ────────────────────────────────────────────────

export type PhotoReport = {
  id: string;
  photoId: string | null;
  kind: ReportKind;
  message: string | null;
  status: "pending" | "kept" | "removed";
  createdAt: string;
  resolvedAt: string | null;
  reporterName: string;
  thumbUrl: string | null;
};

const RESOLVED_HISTORY_LIMIT = 30;

/** Otwarte zgłoszenia (wszystkie) + ostatnie rozpatrzone. Wywołujący autoryzuje organizatora. */
export async function listPhotoReports(eventId: string): Promise<{ pending: PhotoReport[]; resolved: PhotoReport[] }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_photo_reports")
    .select("id, photo_id, kind, message, status, created_at, resolved_at, attendees(first_name, last_name)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  type Row = {
    id: string;
    photo_id: string | null;
    kind: ReportKind;
    message: string | null;
    status: PhotoReport["status"];
    created_at: string;
    resolved_at: string | null;
    attendees: { first_name: string | null; last_name: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const pendingRows = rows.filter((r) => r.status === "pending");
  const resolvedRows = rows.filter((r) => r.status !== "pending").slice(0, RESOLVED_HISTORY_LIMIT);

  const photoIds = [...new Set(pendingRows.map((r) => r.photo_id).filter((id): id is string => !!id))];
  const thumbs = new Map<string, string>();
  if (photoIds.length) {
    const { data: photos } = await admin.from("event_photos").select("id, thumb_path").eq("event_id", eventId).in("id", photoIds);
    const list = ((photos ?? []) as { id: string; thumb_path: string | null }[]).filter((p) => p.thumb_path);
    const urls = await signedUrls(list.map((p) => p.thumb_path as string), SIGNED_VIEW_TTL_S);
    for (const p of list) {
      const url = urls.get(p.thumb_path as string);
      if (url) thumbs.set(p.id, url);
    }
  }

  const map = (r: Row): PhotoReport => ({
    id: r.id,
    photoId: r.photo_id,
    kind: r.kind,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    reporterName: [r.attendees?.first_name, r.attendees?.last_name].filter(Boolean).join(" ") || "Uczestnik",
    thumbUrl: r.photo_id ? thumbs.get(r.photo_id) ?? null : null,
  });
  return { pending: pendingRows.map(map), resolved: resolvedRows.map(map) };
}

/**
 * Decyzja organizatora o otwartym zgłoszeniu. „keep” → status kept (zdjęcie wraca, jeśli nie ma
 * innych otwartych zgłoszeń). „remove” → zwraca photoId do usunięcia (deletePhotos zamyka
 * wszystkie otwarte zgłoszenia tego zdjęcia jako „removed”).
 */
export async function resolvePhotoReport(
  eventId: string,
  reportId: string,
  decision: "keep" | "remove",
): Promise<{ ok: true; photoId: string | null } | { ok: false; error: string }> {
  if (!isUuid(reportId) || (decision !== "keep" && decision !== "remove")) return { ok: false, error: "Zgłoszenie nie istnieje." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_photo_reports")
    .select("id, photo_id, status")
    .eq("id", reportId)
    .eq("event_id", eventId)
    .maybeSingle();
  const report = data as { id: string; photo_id: string | null; status: string } | null;
  if (!report) return { ok: false, error: "Zgłoszenie nie istnieje." };
  if (report.status !== "pending") return { ok: false, error: "Zgłoszenie zostało już rozpatrzone." };

  if (decision === "remove" && report.photo_id) return { ok: true, photoId: report.photo_id };

  const { error } = await admin
    .from("event_photo_reports")
    .update({ status: decision === "keep" ? "kept" : "removed", resolved_at: new Date().toISOString() })
    .eq("id", report.id)
    .eq("event_id", eventId)
    .eq("status", "pending");
  if (error) return { ok: false, error: "Nie udało się zapisać decyzji." };
  return { ok: true, photoId: null };
}
