"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/request-origin";
import {
  sendAttendeeConfirmationEmail,
  sendAttendeePendingApprovalEmail,
} from "@/lib/email/attendee-confirmation";
import {
  ATTENDEE_TOKEN_COOKIE,
  ATTENDEE_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/attendee-session";
import type { Event } from "@/lib/events";

export type RegisterAttendeeState = {
  status: "idle" | "error";
  message?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerAttendee(
  eventId: string,
  slug: string,
  _prevState: RegisterAttendeeState,
  formData: FormData,
): Promise<RegisterAttendeeState> {
  const firstName = formData.get("first_name");
  const lastName = formData.get("last_name");
  const email = formData.get("email");
  const company = formData.get("company");
  const jobTitle = formData.get("job_title");
  const industry = formData.get("industry");
  const goal = formData.get("goal");
  const interests = formData.getAll("interests").filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const gdprConsent = formData.get("gdpr_consent");
  const marketingConsent = formData.get("marketing_consent");

  if (typeof firstName !== "string" || !firstName.trim()) {
    return { status: "error", message: "Podaj imię." };
  }

  if (typeof lastName !== "string" || !lastName.trim()) {
    return { status: "error", message: "Podaj nazwisko." };
  }

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return { status: "error", message: "Podaj poprawny adres email." };
  }

  if (!gdprConsent) {
    return {
      status: "error",
      message: "Zgoda na przetwarzanie danych jest wymagana, żeby się zarejestrować.",
    };
  }

  const supabase = createAdminClient();
  const trimmedEmail = email.trim();
  const trimmedFirstName = firstName.trim();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<Event>();

  if (!event) {
    return {
      status: "error",
      message: "Nie udało się zarejestrować. Spróbuj ponownie.",
    };
  }

  const { data: attendee, error } = await supabase
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: trimmedFirstName,
      last_name: lastName.trim(),
      email: trimmedEmail,
      company: typeof company === "string" && company.trim() ? company.trim() : null,
      job_title: typeof jobTitle === "string" && jobTitle.trim() ? jobTitle.trim() : null,
      industry: typeof industry === "string" && industry.trim() ? industry.trim() : null,
      interests: interests.length > 0 ? interests : null,
      goal: typeof goal === "string" && goal.trim() ? goal.trim() : null,
      gdpr_consent_at: new Date().toISOString(),
      marketing_consent: marketingConsent === "on",
      status: event.requires_approval ? "pending" : "approved",
    })
    .select("qr_code_token")
    .single();

  if (error || !attendee) {
    return {
      status: "error",
      message: "Nie udało się zarejestrować. Spróbuj ponownie.",
    };
  }

  try {
    if (event.requires_approval) {
      await sendAttendeePendingApprovalEmail({
        to: trimmedEmail,
        firstName: trimmedFirstName,
        event,
      });
    } else {
      const headersList = await headers();
      const origin = getOrigin(headersList);
      await sendAttendeeConfirmationEmail({
        to: trimmedEmail,
        firstName: trimmedFirstName,
        event,
        qrCodeToken: attendee.qr_code_token,
        origin,
      });
    }
  } catch (emailError) {
    console.error("Failed to send attendee registration email:", emailError);
  }

  const cookieStore = await cookies();
  cookieStore.set(ATTENDEE_TOKEN_COOKIE, attendee.qr_code_token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/e/${slug}`,
    maxAge: ATTENDEE_TOKEN_MAX_AGE_SECONDS,
  });

  // Uwaga: cookie ustawiamy też dla statusu 'pending' — getCurrentAttendee()
  // (Krok 2.3) i tak nie uzna takiego attendee za zalogowanego, dopóki
  // status nie zmieni się na 'approved'. Dzięki temu, gdy organizator
  // zatwierdzi zgłoszenie, ta sama przeglądarka automatycznie odzyska dostęp
  // bez konieczności ponownego klikania linku z emaila.
  const status = event.requires_approval ? "pending" : "approved";
  redirect(
    `/e/${slug}/welcome?name=${encodeURIComponent(firstName.trim())}&status=${status}`,
  );
}
