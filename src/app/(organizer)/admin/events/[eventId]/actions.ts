"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseLines } from "@/lib/events";
import { parseDateTimeLocal } from "@/lib/format";
import { validateSlug } from "@/lib/slug";
import { addDomain, removeDomain, getDomainStatus } from "@/lib/vercel-domains";
import { getPaidOrderCount } from "@/lib/orders";
import { featureGate, hasFeature } from "@/lib/entitlements";

const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "eventro.pl";
const hasVercelConfig = () =>
  !!(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID);

export type EventFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export type EventDangerState = {
  status: "idle" | "error" | "success";
  message?: string;
  blockedByPayments?: boolean;
};

export async function updateEvent(
  eventId: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const name = formData.get("name");
  const slug = formData.get("slug");
  const startsAt = formData.get("starts_at");
  const endsAt = formData.get("ends_at");
  const timezone = formData.get("timezone");
  const location = formData.get("location");
  const eventType = formData.get("event_type");
  const primaryColor = formData.get("primary_color");
  const roomNames = parseLines(formData.get("room_names"));
  const interestOptions = parseLines(formData.get("interest_options"));
  const requiresApproval = formData.get("requires_approval") === "on";
  const gamificationEnabled = formData.get("gamification_enabled") === "on";

  const lotteryRaw = formData.get("lottery_points_per_ticket");
  let lotteryPointsPerTicket: number | null = null;
  if (typeof lotteryRaw === "string" && lotteryRaw.trim()) {
    const parsedLottery = Number(lotteryRaw);
    if (!Number.isInteger(parsedLottery) || parsedLottery < 1) {
      return {
        status: "error",
        message: "Punkty na 1 los muszą być dodatnią liczbą całkowitą.",
      };
    }
    lotteryPointsPerTicket = parsedLottery;
  }

  if (typeof name !== "string" || !name.trim()) {
    return { status: "error", message: "Podaj nazwę eventu." };
  }

  if (typeof slug !== "string") {
    return { status: "error", message: "Podaj adres URL eventu." };
  }

  const slugError = validateSlug(slug);
  if (slugError) return { status: "error", message: slugError };

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

  const supabase = await createClient();

  // Odczytaj aktualny slug i status — potrzebne do ewentualnej rotacji domeny.
  const { data: currentEvent } = await supabase
    .from("events")
    .select("slug, status, organization_id, gamification_enabled, lottery_points_per_ticket")
    .eq("id", eventId)
    .maybeSingle();

  if (!currentEvent) {
    return { status: "error", message: "Event nie znaleziony." };
  }

  // Bramki planu — blokujemy tylko WŁĄCZANIE funkcji spoza planu (już włączone zostawiamy,
  // żeby zapis pozostałych pól nie przestał działać po zmianie planu).
  if (gamificationEnabled && !currentEvent.gamification_enabled) {
    const gate = await featureGate(currentEvent.organization_id, "gamification");
    if (!gate.ok) return { status: "error", message: gate.message };
  }
  if (lotteryPointsPerTicket != null && currentEvent.lottery_points_per_ticket == null) {
    const gate = await featureGate(currentEvent.organization_id, "gamification_rewards");
    if (!gate.ok) return { status: "error", message: gate.message };
  }

  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("slug", slug)
    .neq("id", eventId)
    .maybeSingle();

  if (existing) {
    return {
      status: "error",
      message: "Ten adres jest już zajęty, wybierz inny.",
    };
  }

  const { error } = await supabase
    .from("events")
    .update({
      name: name.trim(),
      slug,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      timezone,
      location:
        typeof location === "string" && location.trim()
          ? location.trim()
          : null,
      event_type:
        typeof eventType === "string" && eventType.trim()
          ? eventType.trim()
          : null,
      primary_color:
        typeof primaryColor === "string" && primaryColor.trim()
          ? primaryColor.trim()
          : null,
      room_names: roomNames,
      interest_options: interestOptions.length > 0 ? interestOptions : null,
      requires_approval: requiresApproval,
      gamification_enabled: gamificationEnabled,
      lottery_points_per_ticket: lotteryPointsPerTicket,
    })
    .eq("id", eventId);

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Ten adres jest już zajęty, wybierz inny.",
      };
    }
    return {
      status: "error",
      message: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    };
  }

  // Przy zmianie sluga opublikowanego eventu: zamień domeny (best-effort).
  if (
    currentEvent &&
    currentEvent.slug !== slug &&
    (currentEvent.status === "published" || currentEvent.status === "live") &&
    hasVercelConfig()
  ) {
    const oldHost = `${currentEvent.slug}.${ROOT_DOMAIN}`;
    const newHost = `${slug}.${ROOT_DOMAIN}`;
    const subdomainsAllowed = await hasFeature(currentEvent.organization_id, "subdomains");
    Promise.all([
      removeDomain(oldHost),
      subdomainsAllowed ? addDomain(newHost) : null,
    ]).catch((err) =>
      console.error("[vercel-domains] slug swap failed:", err),
    );
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { status: "success", message: "Zapisano zmiany." };
}

export async function publishEvent(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId)
    .eq("status", "draft")
    .select("id, slug, organization_id");

  if (error) {
    throw new Error(`Publish failed: ${error.message} (code: ${error.code})`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Update affected 0 rows – sprawdź RLS lub czy event istnieje",
    );
  }

  // Zarejestruj subdomenę w Vercel (best-effort — publikacja nie jest blokowana).
  // Bez subdomeny w planie event działa pod adresem /e/{slug}.
  if (
    hasVercelConfig() &&
    (await hasFeature(data[0].organization_id, "subdomains"))
  ) {
    const host = `${data[0].slug}.${ROOT_DOMAIN}`;
    addDomain(host).catch((err) =>
      console.error(`[vercel-domains] addDomain(${host}) after publish threw:`, err),
    );
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
}

export async function startEvent(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ status: "live" })
    .eq("id", eventId)
    .eq("status", "published")
    .select();

  if (error) {
    throw new Error(`Start failed: ${error.message} (code: ${error.code})`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Update affected 0 rows – sprawdź RLS lub czy event istnieje",
    );
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
}

export async function completeEvent(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId)
    .eq("status", "live")
    .select();

  if (error) {
    throw new Error(`Complete failed: ${error.message} (code: ${error.code})`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Update affected 0 rows – sprawdź RLS lub czy event istnieje",
    );
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
}

export async function unpublishEvent(eventId: string): Promise<EventDangerState> {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("slug, status")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) return { status: "error", message: "Event nie istnieje." };
  if (event.status !== "published" && event.status !== "live") {
    return { status: "error", message: "Event nie jest opublikowany." };
  }

  const { error } = await supabase
    .from("events")
    .update({ status: "draft" })
    .eq("id", eventId)
    .in("status", ["published", "live"]);

  if (error) {
    return { status: "error", message: "Nie udało się cofnąć publikacji. Spróbuj ponownie." };
  }

  if (hasVercelConfig()) {
    const host = `${event.slug}.${ROOT_DOMAIN}`;
    removeDomain(host).catch((err) =>
      console.error(`[vercel-domains] removeDomain(${host}) after unpublish:`, err),
    );
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
  return { status: "success" };
}

export async function softDeleteEvent(
  eventId: string,
  confirmedName: string,
): Promise<EventDangerState> {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("slug, status, name")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) return { status: "error", message: "Event nie istnieje." };

  if (confirmedName.trim() !== event.name) {
    return { status: "error", message: "Wpisana nazwa nie pasuje do nazwy eventu." };
  }

  // Block if paid orders exist — financial records must not be lost.
  const paidCount = await getPaidOrderCount(eventId);
  if (paidCount > 0) {
    return {
      status: "error",
      blockedByPayments: true,
      message: `Ten event ma ${paidCount} opłacone zamówienie(a) — nie można go usunąć. Najpierw obsłuż zwroty lub skontaktuj się z supportem.`,
    };
  }

  const { error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    return { status: "error", message: "Nie udało się usunąć eventu. Spróbuj ponownie." };
  }

  if (
    hasVercelConfig() &&
    (event.status === "published" || event.status === "live")
  ) {
    const host = `${event.slug}.${ROOT_DOMAIN}`;
    removeDomain(host).catch((err) =>
      console.error(`[vercel-domains] removeDomain(${host}) after delete:`, err),
    );
  }

  revalidatePath("/admin");
  redirect("/admin");
}

/** Ponawia rejestrację subdomeny — wywoływane z widgetu statusu w panelu. */
export async function retrySubdomain(
  eventId: string,
): Promise<"active" | "activating" | "error"> {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("slug, organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return "error";
  if (!(await hasFeature(event.organization_id, "subdomains"))) return "error";
  if (!hasVercelConfig()) return "error";

  const host = `${event.slug}.${ROOT_DOMAIN}`;
  const addResult = await addDomain(host);
  if (!addResult.ok) return "error";

  const status = await getDomainStatus(host);
  return status?.verified ? "active" : "activating";
}

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;

export async function uploadEventLogo(
  eventId: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik logo." };
  }

  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return {
      status: "error",
      message: "Logo musi być w formacie JPEG, PNG lub WebP.",
    };
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return {
      status: "error",
      message: "Logo nie może być większe niż 5MB.",
    };
  }

  const supabase = await createClient();
  const extension = file.name.split(".").pop() ?? "png";
  const path = `${eventId}/logo-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("event-logos")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return {
      status: "error",
      message: "Nie udało się wgrać logo. Spróbuj ponownie.",
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-logos").getPublicUrl(path);

  const { error } = await supabase
    .from("events")
    .update({ logo_url: publicUrl })
    .eq("id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać logo. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { status: "success", message: "Logo zapisane." };
}

export async function uploadEventBadgeBg(
  eventId: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const file = formData.get("badge_bg");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Wybierz plik tła." };
  }

  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return {
      status: "error",
      message: "Tło musi być w formacie JPEG, PNG lub WebP.",
    };
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return {
      status: "error",
      message: "Plik tła nie może być większy niż 5MB.",
    };
  }

  const supabase = await createClient();
  const { data: ownEvent } = await supabase
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ownEvent) return { status: "error", message: "Event nie znaleziony." };
  const gate = await featureGate(ownEvent.organization_id, "badges");
  if (!gate.ok) return { status: "error", message: gate.message };
  const extension = file.name.split(".").pop() ?? "jpg";
  const storagePath = `${eventId}/badge-bg-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("event-logos")
    .upload(storagePath, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return {
      status: "error",
      message: "Nie udało się wgrać tła. Spróbuj ponownie.",
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-logos").getPublicUrl(storagePath);

  const { error } = await supabase
    .from("events")
    .update({ badge_bg_url: publicUrl })
    .eq("id", eventId);

  if (error) {
    return {
      status: "error",
      message: "Nie udało się zapisać tła. Spróbuj ponownie.",
    };
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { status: "success", message: "Tło identyfikatora zapisane." };
}
