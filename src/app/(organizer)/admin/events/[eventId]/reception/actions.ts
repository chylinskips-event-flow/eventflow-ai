"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import type { BadgeLabelResult } from "@/lib/badge-label-core";
import {
  checkInByQr,
  checkInById,
  undoCheckIn,
  getBadgeLabel,
  generateReceptionToken,
  revokeReceptionToken,
  type CheckInResult,
} from "@/lib/reception";

async function verifyOrganizer(eventId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) throw new Error("Brak dostępu");
  return event;
}

export async function organizerBadgeLabel(
  eventId: string,
  attendeeId: string,
): Promise<BadgeLabelResult> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu do wydarzenia." };
  const gate = await featureGate(event.organization_id, "badges");
  if (!gate.ok) return { ok: false, error: gate.message };
  return getBadgeLabel(event, attendeeId);
}

export async function organizerCheckInByQr(
  eventId: string,
  checkInToken: string,
): Promise<CheckInResult> {
  await verifyOrganizer(eventId);
  const result = await checkInByQr(eventId, checkInToken, "organizer");
  revalidatePath(`/admin/events/${eventId}/reception`);
  return result;
}

export async function organizerCheckInById(
  eventId: string,
  attendeeId: string,
): Promise<CheckInResult> {
  await verifyOrganizer(eventId);
  const result = await checkInById(eventId, attendeeId, "organizer");
  revalidatePath(`/admin/events/${eventId}/reception`);
  return result;
}

export async function organizerUndoCheckIn(
  eventId: string,
  attendeeId: string,
): Promise<void> {
  await verifyOrganizer(eventId);
  await undoCheckIn(eventId, attendeeId);
  revalidatePath(`/admin/events/${eventId}/reception`);
}

export async function organizerGenerateReceptionToken(
  eventId: string,
): Promise<string> {
  await verifyOrganizer(eventId);
  const token = await generateReceptionToken(eventId);
  revalidatePath(`/admin/events/${eventId}/reception`);
  return token;
}

export async function organizerRevokeReceptionToken(
  eventId: string,
): Promise<void> {
  await verifyOrganizer(eventId);
  await revokeReceptionToken(eventId);
  revalidatePath(`/admin/events/${eventId}/reception`);
}
