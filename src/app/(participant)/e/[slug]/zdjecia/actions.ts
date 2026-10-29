"use server";

import { revalidatePath } from "next/cache";
import { photoDownloadName } from "@/lib/gallery-core";
import {
  getParticipantPhotoUrl,
  listParticipantPhotos,
  reportPhoto,
  resolveParticipantGallery,
  setPhotoTag,
  type ParticipantPhotoPage,
  type ReportResult,
} from "@/lib/gallery-participant";

// BEZPIECZEŃSTWO: uczestnik i event WYŁĄCZNIE z resolveParticipantGallery(slug) (cookie) —
// z przeglądarki przychodzi tylko identyfikator zdjęcia. Każda akcja sprawdza dostęp od nowa
// (check-in, publikacja, plan), więc cofnięcie publikacji działa od razu.

const NO_ACCESS = "Galeria jest niedostępna. Odśwież stronę.";

async function openContext(slug: string) {
  const ctx = await resolveParticipantGallery(String(slug ?? ""));
  return ctx.state === "open" ? ctx : null;
}

export async function loadParticipantPhotos(
  slug: string,
  opts: { mine?: boolean; offset?: number },
): Promise<{ ok: true; page: ParticipantPhotoPage } | { ok: false; error: string }> {
  const ctx = await openContext(slug);
  if (!ctx) return { ok: false, error: NO_ACCESS };
  const page = await listParticipantPhotos(ctx.event.id, ctx.attendee.id, {
    mine: opts?.mine === true,
    offset: Number(opts?.offset) || 0,
  });
  return { ok: true, page };
}

/** Podgląd pełnoekranowy: wersja display, adres ważny 15 min. */
export async function getParticipantPhotoView(slug: string, photoId: string): Promise<string | null> {
  const ctx = await openContext(slug);
  if (!ctx) return null;
  return getParticipantPhotoUrl(ctx.event.id, photoId, "view");
}

/** Pobranie: wersja display (ze znakiem wodnym), adres ważny 60 s, z nazwą pliku. */
export async function getParticipantPhotoDownload(slug: string, photoId: string): Promise<string | null> {
  const ctx = await openContext(slug);
  if (!ctx) return null;
  return getParticipantPhotoUrl(ctx.event.id, photoId, "download", photoDownloadName(ctx.event.slug, String(photoId)));
}

export async function toggleParticipantPhotoTag(slug: string, photoId: string, on: boolean): Promise<boolean> {
  const ctx = await openContext(slug);
  if (!ctx) return false;
  return setPhotoTag(ctx.event.id, ctx.attendee.id, photoId, on === true);
}

export async function reportParticipantPhoto(
  slug: string,
  photoId: string,
  kind: string,
  message: string,
): Promise<ReportResult> {
  const ctx = await openContext(slug);
  if (!ctx) return { ok: false, error: NO_ACCESS };
  const res = await reportPhoto(ctx.event.id, ctx.attendee.id, photoId, kind, message);
  if (res.ok) {
    revalidatePath(`/e/${ctx.event.slug}/zdjecia`);
    revalidatePath(`/admin/events/${ctx.event.id}/gallery`);
  }
  return res;
}
