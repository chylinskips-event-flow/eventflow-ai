"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOwnEvent } from "@/lib/events";
import { getOrigin } from "@/lib/request-origin";
import { parseGuestList } from "@/lib/guest-import-core";
import {
  importGuests,
  resendTicket,
  sendTicketBatch,
  type GuestImportResult,
  type TicketBatchResult,
  type TicketResendResult,
} from "@/lib/guest-import";

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/attendees`);
  revalidatePath(`/admin/events/${eventId}/attendees/import`);
}

export async function importGuestList(eventId: string, text: string): Promise<GuestImportResult> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu do wydarzenia." };
  const { guests } = parseGuestList(text);
  if (guests.length === 0) return { ok: false, error: "Na liście nie ma poprawnych wierszy." };
  const result = await importGuests(event, guests);
  refresh(eventId);
  return result;
}

export async function sendTickets(eventId: string, skipIds: string[]): Promise<TicketBatchResult> {
  const event = await getOwnEvent(eventId);
  if (!event) throw new Error("Brak dostępu");
  const result = await sendTicketBatch(event, getOrigin(await headers()), skipIds);
  refresh(eventId);
  return result;
}

export async function sendOneTicket(eventId: string, attendeeId: string): Promise<TicketResendResult> {
  const event = await getOwnEvent(eventId);
  if (!event) return { ok: false, error: "Brak dostępu do wydarzenia." };
  const result = await resendTicket(event, getOrigin(await headers()), attendeeId);
  refresh(eventId);
  return result;
}
