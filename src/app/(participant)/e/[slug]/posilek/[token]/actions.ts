"use server";

import { revalidatePath } from "next/cache";
import type { CheckInResult } from "@/lib/reception";
import { getMealByToken, redeemById, redeemByQr, undoRedemption } from "@/lib/meals";

async function resolveMeal(token: string) {
  const found = await getMealByToken(token);
  if (!found) throw new Error("Token nieaktywny");
  return found;
}

export async function staffRedeemByQr(token: string, checkInToken: string): Promise<CheckInResult> {
  const { meal, event } = await resolveMeal(token);
  const result = await redeemByQr(meal, checkInToken, "staff");
  revalidatePath(`/e/${event.slug}/posilek/${token}`);
  return result;
}

export async function staffRedeemById(token: string, attendeeId: string): Promise<CheckInResult> {
  const { meal, event } = await resolveMeal(token);
  const result = await redeemById(meal, attendeeId, "staff");
  revalidatePath(`/e/${event.slug}/posilek/${token}`);
  return result;
}

export async function staffUndoRedemption(token: string, attendeeId: string): Promise<void> {
  const { meal, event } = await resolveMeal(token);
  await undoRedemption(meal, attendeeId);
  revalidatePath(`/e/${event.slug}/posilek/${token}`);
}
