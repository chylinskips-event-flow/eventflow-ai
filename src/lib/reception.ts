import { createAdminClient } from "@/lib/supabase/admin";
import type { BadgeLabelResult } from "@/lib/badge-label-core";
import { isEventOpenForStaff } from "@/lib/staff-link";
import { buildEventApexUrl } from "@/lib/event-url";


export type ReceptionAttendee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  checked_in_at: string | null;
};

export type CheckInResult =
  | { ok: true; name: string; alreadyCheckedIn: false }
  | { ok: true; name: string; alreadyCheckedIn: true; checkedInAt: string }
  | { ok: false; error: "not_found" | "not_approved" }
  // Tylko akcje linku obsługi: link wyłączony lub wydarzenie niedostępne.
  | { ok: false; error: "link_inactive" };

// ─── Odczyt przez reception_token (bez sesji organizatora) ───────────────────

/** Wydarzenie z linku recepcji albo null: link wyłączony, wydarzenie usunięte lub zawieszone. */
export async function getEventByReceptionToken(
  token: string,
): Promise<{ id: string; organization_id: string; slug: string; name: string } | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("events")
    .select("id, organization_id, slug, name, deleted_at")
    .eq("reception_token", token)
    .maybeSingle();
  if (!data || !(await isEventOpenForStaff(data))) return null;
  return { id: data.id, organization_id: data.organization_id, slug: data.slug, name: data.name };
}

// ─── Listy uczestników (tylko approved, tylko pola recepcji) ─────────────────

export async function getReceptionList(
  eventId: string,
): Promise<ReceptionAttendee[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("attendees")
    .select("id, first_name, last_name, company, checked_in_at")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  return data ?? [];
}

// ─── Etykieta identyfikatora (druk na recepcji) ──────────────────────────────

/** Dane etykiety jednej osoby. Wywołujący autoryzuje recepcję i sprawdza funkcję „badges”. */
export async function getBadgeLabel(
  event: { id: string; slug: string; name: string },
  attendeeId: string,
  origin: string,
): Promise<BadgeLabelResult> {
  const { data } = await createAdminClient()
    .from("attendees")
    .select("first_name, last_name, company, contact_code, status")
    .eq("id", attendeeId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (!data || data.status !== "approved") return { ok: false, error: "Nie znaleziono uczestnika." };
  return {
    ok: true,
    label: {
      name: [data.first_name, data.last_name].filter(Boolean).join(" ") || "Uczestnik",
      company: data.company,
      eventName: event.name,
      // Adres z NEXT_PUBLIC_ROOT_DOMAIN albo z adresu żądania (Preview, lokalnie) — nie zawsze produkcja.
      qrUrl: `${buildEventApexUrl(event.slug, origin)}/connect/${data.contact_code}`,
    },
  };
}

// ─── Check-in po QR (check_in_token ze skanera) ──────────────────────────────

export async function checkInByQr(
  eventId: string,
  checkInToken: string,
  source: "organizer" | "staff",
): Promise<CheckInResult> {
  const db = createAdminClient();

  const { data: attendee } = await db
    .from("attendees")
    .select("id, first_name, last_name, status, checked_in_at")
    .eq("event_id", eventId)
    .eq("check_in_token", checkInToken)
    .maybeSingle();

  if (!attendee) return { ok: false, error: "not_found" };
  if (attendee.status !== "approved") return { ok: false, error: "not_approved" };

  const name =
    [attendee.first_name, attendee.last_name].filter(Boolean).join(" ") ||
    "Uczestnik";

  if (attendee.checked_in_at) {
    return { ok: true, name, alreadyCheckedIn: true, checkedInAt: attendee.checked_in_at };
  }

  await db
    .from("attendees")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: source })
    .eq("id", attendee.id)
    .eq("event_id", eventId);

  return { ok: true, name, alreadyCheckedIn: false };
}

// ─── Check-in po attendee ID (przycisk na liście) ────────────────────────────

export async function checkInById(
  eventId: string,
  attendeeId: string,
  source: "organizer" | "staff",
): Promise<CheckInResult> {
  const db = createAdminClient();

  const { data: attendee } = await db
    .from("attendees")
    .select("id, first_name, last_name, status, checked_in_at")
    .eq("event_id", eventId)
    .eq("id", attendeeId)
    .maybeSingle();

  if (!attendee) return { ok: false, error: "not_found" };
  if (attendee.status !== "approved") return { ok: false, error: "not_approved" };

  const name =
    [attendee.first_name, attendee.last_name].filter(Boolean).join(" ") ||
    "Uczestnik";

  if (attendee.checked_in_at) {
    return { ok: true, name, alreadyCheckedIn: true, checkedInAt: attendee.checked_in_at };
  }

  await db
    .from("attendees")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: source })
    .eq("id", attendee.id)
    .eq("event_id", eventId);

  return { ok: true, name, alreadyCheckedIn: false };
}

// ─── Cofanie check-in ────────────────────────────────────────────────────────

export async function undoCheckIn(
  eventId: string,
  attendeeId: string,
): Promise<void> {
  const db = createAdminClient();
  await db
    .from("attendees")
    .update({ checked_in_at: null, checked_in_by: null })
    .eq("id", attendeeId)
    .eq("event_id", eventId);
}

// ─── Zarządzanie reception_token (tylko przez organizatora) ─────────────────

export async function generateReceptionToken(
  eventId: string,
): Promise<string> {
  const db = createAdminClient();
  const token = crypto.randomUUID();
  await db
    .from("events")
    .update({ reception_token: token })
    .eq("id", eventId);
  return token;
}

export async function revokeReceptionToken(eventId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("events")
    .update({ reception_token: null })
    .eq("id", eventId);
}
