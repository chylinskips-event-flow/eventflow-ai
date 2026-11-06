"use server";

import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import type { CheckInResult } from "@/lib/reception";
import {
  createMeal,
  deleteMeal,
  getEventMeal,
  redeemById,
  redeemByQr,
  setMealToken,
  undoRedemption,
  type MealActionResult,
} from "@/lib/meals";

async function verifyMeal(eventId: string, mealId: string) {
  const event = await getOwnEvent(eventId);
  if (!event) throw new Error("Brak dostępu");
  const meal = await getEventMeal(eventId, mealId);
  if (!meal) throw new Error("Brak posiłku");
  return meal;
}

function refresh(eventId: string, mealId?: string) {
  revalidatePath(`/admin/events/${eventId}/meals`);
  if (mealId) revalidatePath(`/admin/events/${eventId}/meals/${mealId}`);
}

export async function addMeal(eventId: string, name: string): Promise<MealActionResult> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu do wydarzenia." };
  const result = await createMeal(eventId, name);
  refresh(eventId);
  return result;
}

export async function removeMeal(eventId: string, mealId: string): Promise<MealActionResult> {
  const meal = await verifyMeal(eventId, mealId);
  const result = await deleteMeal(meal);
  refresh(eventId);
  return result;
}

export async function renewMealLink(eventId: string, mealId: string): Promise<void> {
  const meal = await verifyMeal(eventId, mealId);
  await setMealToken(meal, crypto.randomUUID());
  refresh(eventId, mealId);
}

export async function disableMealLink(eventId: string, mealId: string): Promise<void> {
  const meal = await verifyMeal(eventId, mealId);
  await setMealToken(meal, null);
  refresh(eventId, mealId);
}

export async function organizerRedeemByQr(
  eventId: string,
  mealId: string,
  checkInToken: string,
): Promise<CheckInResult> {
  const meal = await verifyMeal(eventId, mealId);
  const result = await redeemByQr(meal, checkInToken, "organizer");
  refresh(eventId, mealId);
  return result;
}

export async function organizerRedeemById(
  eventId: string,
  mealId: string,
  attendeeId: string,
): Promise<CheckInResult> {
  const meal = await verifyMeal(eventId, mealId);
  const result = await redeemById(meal, attendeeId, "organizer");
  refresh(eventId, mealId);
  return result;
}

export async function organizerUndoRedemption(
  eventId: string,
  mealId: string,
  attendeeId: string,
): Promise<void> {
  const meal = await verifyMeal(eventId, mealId);
  await undoRedemption(meal, attendeeId);
  refresh(eventId, mealId);
}
