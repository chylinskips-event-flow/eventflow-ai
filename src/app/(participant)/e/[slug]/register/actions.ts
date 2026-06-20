"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type RegisterAttendeeState = {
  status: "idle" | "error";
  message?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ATTENDEE_TOKEN_COOKIE = "eventflow_attendee_token";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

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
  const { data: attendee, error } = await supabase
    .from("attendees")
    .insert({
      event_id: eventId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      company: typeof company === "string" && company.trim() ? company.trim() : null,
      job_title: typeof jobTitle === "string" && jobTitle.trim() ? jobTitle.trim() : null,
      industry: typeof industry === "string" && industry.trim() ? industry.trim() : null,
      interests: interests.length > 0 ? interests : null,
      goal: typeof goal === "string" && goal.trim() ? goal.trim() : null,
      gdpr_consent_at: new Date().toISOString(),
      marketing_consent: marketingConsent === "on",
    })
    .select("qr_code_token")
    .single();

  if (error || !attendee) {
    return {
      status: "error",
      message: "Nie udało się zarejestrować. Spróbuj ponownie.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(ATTENDEE_TOKEN_COOKIE, attendee.qr_code_token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/e/${slug}`,
    maxAge: THIRTY_DAYS_SECONDS,
  });

  redirect(`/e/${slug}/welcome?name=${encodeURIComponent(firstName.trim())}`);
}
