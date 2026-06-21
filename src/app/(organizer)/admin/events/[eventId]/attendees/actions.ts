"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnEvent } from "@/lib/events";
import {
  sendAttendeeConfirmationEmail,
  sendAttendeeRejectedEmail,
} from "@/lib/email/attendee-confirmation";
import { getOrigin } from "@/lib/request-origin";
import { headers } from "next/headers";

export type AttendeeModerationState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export async function approveAttendee(
  eventId: string,
  attendeeId: string,
): Promise<AttendeeModerationState> {
  const event = await getOwnEvent(eventId);
  if (!event) {
    return { status: "error", message: "Event nie został znaleziony." };
  }

  const supabase = await createClient();
  const { data: attendee, error } = await supabase
    .from("attendees")
    .update({ status: "approved" })
    .eq("id", attendeeId)
    .eq("event_id", eventId)
    .select("email, first_name, qr_code_token")
    .single();

  if (error || !attendee) {
    return {
      status: "error",
      message: "Nie udało się zatwierdzić uczestnika. Spróbuj ponownie.",
    };
  }

  if (attendee.email) {
    try {
      const headersList = await headers();
      const origin = getOrigin(headersList);
      await sendAttendeeConfirmationEmail({
        to: attendee.email,
        firstName: attendee.first_name ?? "",
        event,
        qrCodeToken: attendee.qr_code_token,
        origin,
      });
    } catch (emailError) {
      console.error("Failed to send attendee approval email:", emailError);
    }
  }

  revalidatePath(`/admin/events/${eventId}/attendees`);
  return { status: "success", message: "Uczestnik zatwierdzony." };
}

export async function rejectAttendee(
  eventId: string,
  attendeeId: string,
): Promise<AttendeeModerationState> {
  const event = await getOwnEvent(eventId);
  if (!event) {
    return { status: "error", message: "Event nie został znaleziony." };
  }

  const supabase = await createClient();
  const { data: attendee, error } = await supabase
    .from("attendees")
    .update({ status: "rejected" })
    .eq("id", attendeeId)
    .eq("event_id", eventId)
    .select("email, first_name")
    .single();

  if (error || !attendee) {
    return {
      status: "error",
      message: "Nie udało się odrzucić uczestnika. Spróbuj ponownie.",
    };
  }

  if (attendee.email) {
    try {
      await sendAttendeeRejectedEmail({
        to: attendee.email,
        firstName: attendee.first_name ?? "",
        event,
      });
    } catch (emailError) {
      console.error("Failed to send attendee rejection email:", emailError);
    }
  }

  revalidatePath(`/admin/events/${eventId}/attendees`);
  return { status: "success", message: "Uczestnik odrzucony." };
}
