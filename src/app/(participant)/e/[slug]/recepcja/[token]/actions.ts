"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getOrigin } from "@/lib/request-origin";
import { featureGate } from "@/lib/entitlements";
import type { BadgeLabelResult } from "@/lib/badge-label-core";
import type { LinkInactiveResult, UndoCheckInResult } from "@/lib/reception-feedback";
import {
  getEventByReceptionToken,
  checkInByQr,
  checkInById,
  undoCheckIn,
  getBadgeLabel,
  type CheckInResult,
} from "@/lib/reception";

// Link wyłączony w trakcie zmiany (lub wydarzenie usunięte / zawieszone): zwracamy wynik
// zamiast rzucać — panel pokazuje „Link nieaktywny” zamiast błędu aplikacji.
const LINK_INACTIVE: LinkInactiveResult = { ok: false, error: "link_inactive" };

export async function staffBadgeLabel(
  receptionToken: string,
  attendeeId: string,
): Promise<BadgeLabelResult> {
  const event = await getEventByReceptionToken(receptionToken);
  if (!event) return { ok: false, error: "Link recepcji jest nieaktywny." };
  const gate = await featureGate(event.organization_id, "badges");
  if (!gate.ok) return { ok: false, error: gate.message };
  return getBadgeLabel(event, attendeeId, getOrigin(await headers()));
}

export async function staffCheckInByQr(
  receptionToken: string,
  checkInToken: string,
): Promise<CheckInResult> {
  const event = await getEventByReceptionToken(receptionToken);
  if (!event) return LINK_INACTIVE;
  const result = await checkInByQr(event.id, checkInToken, "staff");
  revalidatePath(`/e/${event.slug}/recepcja/${receptionToken}`);
  return result;
}

export async function staffCheckInById(
  receptionToken: string,
  attendeeId: string,
): Promise<CheckInResult> {
  const event = await getEventByReceptionToken(receptionToken);
  if (!event) return LINK_INACTIVE;
  const result = await checkInById(event.id, attendeeId, "staff");
  revalidatePath(`/e/${event.slug}/recepcja/${receptionToken}`);
  return result;
}

export async function staffUndoCheckIn(
  receptionToken: string,
  attendeeId: string,
): Promise<UndoCheckInResult> {
  const event = await getEventByReceptionToken(receptionToken);
  if (!event) return LINK_INACTIVE;
  await undoCheckIn(event.id, attendeeId);
  revalidatePath(`/e/${event.slug}/recepcja/${receptionToken}`);
  return { ok: true };
}
