import { createAdminClient } from "@/lib/supabase/admin";

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
  | { ok: false; error: "not_found" | "not_approved" };

// ─── Odczyt przez reception_token (bez sesji organizatora) ───────────────────

export async function getEventByReceptionToken(
  token: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("events")
    .select("id, slug, name")
    .eq("reception_token", token)
    .maybeSingle();
  return data ?? null;
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
