"use server";

import { revalidatePath } from "next/cache";
import {
  getEventByReceptionToken,
  checkInByQr,
  checkInById,
  undoCheckIn,
  type CheckInResult,
} from "@/lib/reception";

async function resolveEvent(receptionToken: string) {
  const event = await getEventByReceptionToken(receptionToken);
  if (!event) throw new Error("Token nieaktywny");
  return event;
}

export async function staffCheckInByQr(
  receptionToken: string,
  checkInToken: string,
): Promise<CheckInResult> {
  const event = await resolveEvent(receptionToken);
  const result = await checkInByQr(event.id, checkInToken, "staff");
  revalidatePath(`/e/${event.slug}/recepcja/${receptionToken}`);
  return result;
}

export async function staffCheckInById(
  receptionToken: string,
  attendeeId: string,
): Promise<CheckInResult> {
  const event = await resolveEvent(receptionToken);
  const result = await checkInById(event.id, attendeeId, "staff");
  revalidatePath(`/e/${event.slug}/recepcja/${receptionToken}`);
  return result;
}

export async function staffUndoCheckIn(
  receptionToken: string,
  attendeeId: string,
): Promise<void> {
  const event = await resolveEvent(receptionToken);
  await undoCheckIn(event.id, attendeeId);
  revalidatePath(`/e/${event.slug}/recepcja/${receptionToken}`);
}
