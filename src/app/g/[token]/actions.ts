"use server";

import {
  finalizePhotoUpload,
  resolveUploadLink,
  startPhotoUpload,
  type FinalizeResult,
  type PhotoMeta,
  type StartUploadResult,
} from "@/lib/gallery";
import { RESERVE_MESSAGES } from "@/lib/gallery-core";

// Fotograf: dostęp = znajomość tokenu linku. Każde wywołanie sprawdza link od nowa
// (unieważniony / przeterminowany / zawieszony event → brak uploadu).

export async function photographerStartUpload(token: string, meta: PhotoMeta): Promise<StartUploadResult> {
  const ctx = await resolveUploadLink(token);
  if (!ctx) return { ok: false, error: RESERVE_MESSAGES.link_invalid };
  return startPhotoUpload(ctx.event.id, { kind: "link", link: ctx.link }, meta);
}

export async function photographerFinalizeUpload(token: string, photoId: string): Promise<FinalizeResult> {
  const ctx = await resolveUploadLink(token);
  if (!ctx) return { ok: false, error: RESERVE_MESSAGES.link_invalid };
  return finalizePhotoUpload(ctx.event, photoId, { kind: "link", link: ctx.link });
}
