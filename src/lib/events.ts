import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EventStatus =
  | "draft"
  | "published"
  | "live"
  | "completed"
  | "archived";

export type Event = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  status: EventStatus;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string | null;
  location: string | null;
  event_type: string | null;
  room_names: string[] | null;
  interest_options: string[] | null;
  registration_open: boolean;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
};

// Domyślna lista zainteresowań w formularzu rejestracji, używana gdy
// organizator nie zdefiniował własnej (events.interest_options === NULL).
export const DEFAULT_INTEREST_OPTIONS = [
  "AI",
  "SaaS",
  "Marketing",
  "Sprzedaż",
  "HR",
  "Finanse",
  "Produkt",
  "Design",
  "Inne",
];

// Parsuje textarea "jedna wartość w linii" z formularza: trim + usunięcie
// pustych + dedup. Wspólne dla sal (room_names) i zainteresowań
// (interest_options) — identyczna logika, jedno źródło prawdy.
export function parseLines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  );
}

export function getRegistrationUnavailableReason(
  event: Pick<Event, "status" | "registration_open">,
): string | null {
  const isPublic = event.status === "published" || event.status === "live";

  if (!isPublic) {
    return "Wydarzenie nie zostało jeszcze opublikowane.";
  }

  if (!event.registration_open) {
    return "Rejestracja na to wydarzenie jest obecnie zamknięta.";
  }

  return null;
}

export async function getOrganizationEvents(
  organizationId: string,
): Promise<Event[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: false });

  return data ?? [];
}

/**
 * Czy zalogowany użytkownik (Supabase Auth) jest właścicielem organizacji
 * tego eventu. Używane przez tryb podglądu strony publicznej — wchodzi w grę
 * tylko przy jawnym ?preview=1. Zwykli odwiedzający nie są zalogowani, więc
 * getUser() zwróci null i funkcja szybko odda false.
 */
export async function isCurrentUserEventOwner(
  event: Pick<Event, "organization_id">,
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", event.organization_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return data !== null;
}

export async function getOwnEvent(eventId: string): Promise<Event | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Pobiera event po slug, niezależnie od statusu/registration_open —
 * używa klienta service_role, bo strona rejestracji musi rozróżnić
 * "event nie istnieje" od "event istnieje, ale nie jest dostępny do
 * rejestracji" (RLS dla anon ukrywa nieopublikowane eventy całkowicie,
 * co uniemożliwiłoby to rozróżnienie).
 */
export const getEventBySlugForRegistration = cache(async function (
  slug: string,
): Promise<Event | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
});
