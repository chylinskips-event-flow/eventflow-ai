"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { parseLines } from "@/lib/events";
import { parseDateTimeLocal } from "@/lib/format";
import { SLUG_PATTERN } from "@/lib/slug";

export type CreateEventState = {
  status: "idle" | "error";
  message?: string;
};

export async function createEvent(
  _prevState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const name = formData.get("name");
  const slug = formData.get("slug");
  const startsAt = formData.get("starts_at");
  const endsAt = formData.get("ends_at");
  const timezone = formData.get("timezone");
  const location = formData.get("location");
  const eventType = formData.get("event_type");
  const roomNames = parseLines(formData.get("room_names"));
  const interestOptions = parseLines(formData.get("interest_options"));
  const requiresApproval = formData.get("requires_approval") === "on";

  if (typeof name !== "string" || !name.trim()) {
    return { status: "error", message: "Podaj nazwę eventu." };
  }

  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    return {
      status: "error",
      message:
        "Adres może zawierać tylko małe litery, cyfry i myślniki (np. moj-event).",
    };
  }

  if (typeof startsAt !== "string" || !startsAt) {
    return { status: "error", message: "Podaj datę i godzinę rozpoczęcia." };
  }

  if (typeof endsAt !== "string" || !endsAt) {
    return { status: "error", message: "Podaj datę i godzinę zakończenia." };
  }

  if (typeof timezone !== "string" || !timezone) {
    return { status: "error", message: "Wybierz strefę czasową." };
  }

  const startsAtIso = parseDateTimeLocal(startsAt, timezone);
  const endsAtIso = parseDateTimeLocal(endsAt, timezone);

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    return {
      status: "error",
      message: "Data zakończenia musi być późniejsza niż data rozpoczęcia.",
    };
  }

  const organization = await getOwnOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return {
      status: "error",
      message: "Ten adres jest już zajęty, wybierz inny.",
    };
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organization_id: organization.id,
      name: name.trim(),
      slug,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      timezone,
      location: typeof location === "string" && location.trim() ? location.trim() : null,
      event_type:
        typeof eventType === "string" && eventType.trim() ? eventType.trim() : null,
      room_names: roomNames,
      // Pusta lista -> NULL: fallback do domyślnej, zahardkodowanej listy.
      interest_options: interestOptions.length > 0 ? interestOptions : null,
      requires_approval: requiresApproval,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !event) {
    if (error?.code === "23505") {
      return {
        status: "error",
        message: "Ten adres jest już zajęty, wybierz inny.",
      };
    }
    return {
      status: "error",
      message: "Nie udało się utworzyć eventu. Spróbuj ponownie.",
    };
  }

  redirect(`/admin/events/${event.id}`);
}
