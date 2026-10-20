"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { parseLines } from "@/lib/events";
import { parseDateTimeLocal } from "@/lib/format";
import { slugify, validateSlug } from "@/lib/slug";
import { checkEventSlug, suggestEventSlug, takenSlugMessage } from "@/lib/event-slug";
import { getLimit } from "@/lib/entitlements";

export type CreateEventState = {
  status: "idle" | "error";
  message?: string;
  /** Pole, którego dotyczy błąd — formularz pokazuje komunikat przy nim. */
  field?: "name" | "slug" | "starts_at" | "ends_at" | "timezone";
};

export async function createEvent(
  _prevState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const name = formData.get("name");
  const rawSlug = formData.get("slug");
  // Końcowy myślnik z wpisywania na bieżąco porządkujemy tu (slugify jest idempotentny).
  const slug = typeof rawSlug === "string" ? slugify(rawSlug) : "";
  const startsAt = formData.get("starts_at");
  const endsAt = formData.get("ends_at");
  const timezone = formData.get("timezone");
  const location = formData.get("location");
  const eventType = formData.get("event_type");
  const roomNames = parseLines(formData.get("room_names"));
  const interestOptions = parseLines(formData.get("interest_options"));
  const requiresApproval = formData.get("requires_approval") === "on";

  if (typeof name !== "string" || !name.trim()) {
    return { status: "error", field: "name", message: "Podaj nazwę eventu." };
  }

  const slugError = validateSlug(slug);
  if (slugError) return { status: "error", field: "slug", message: slugError };

  if (typeof startsAt !== "string" || !startsAt) {
    return { status: "error", field: "starts_at", message: "Podaj datę i godzinę rozpoczęcia." };
  }

  if (typeof endsAt !== "string" || !endsAt) {
    return { status: "error", field: "ends_at", message: "Podaj datę i godzinę zakończenia." };
  }

  if (typeof timezone !== "string" || !timezone) {
    return { status: "error", field: "timezone", message: "Wybierz strefę czasową." };
  }

  const startsAtIso = parseDateTimeLocal(startsAt, timezone);
  const endsAtIso = parseDateTimeLocal(endsAt, timezone);

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    return {
      status: "error",
      field: "ends_at",
      message: "Data zakończenia musi być późniejsza niż data rozpoczęcia.",
    };
  }

  const organization = await getOwnOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();

  // Limit aktywnych eventów w planie (zakończone, zarchiwizowane i usunięte się nie liczą).
  const maxEvents = await getLimit(organization.id, "max_events");
  if (maxEvents != null) {
    const { count } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .in("status", ["draft", "published", "live"]);
    if ((count ?? 0) >= maxEvents) {
      return {
        status: "error",
        message: `Twój plan pozwala na ${maxEvents} aktywn${maxEvents === 1 ? "y event" : "e eventy"} naraz. Zakończ lub usuń event albo przejdź na wyższy plan.`,
      };
    }
  }

  // Adres jest globalnie unikalny — sprawdzamy w całej bazie (RLS widzi tylko własne wydarzenia).
  const availability = await checkEventSlug(slug).catch(() => null);
  if (availability?.status === "taken") {
    return { status: "error", field: "slug", message: takenSlugMessage(availability.suggestion) };
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
      // Wyścig: ktoś zajął adres między sprawdzeniem a zapisem.
      const suggestion = await suggestEventSlug(slug).catch(() => null);
      return { status: "error", field: "slug", message: takenSlugMessage(suggestion) };
    }
    return {
      status: "error",
      message: "Nie udało się utworzyć eventu. Spróbuj ponownie.",
    };
  }

  redirect(`/admin/events/${event.id}`);
}
