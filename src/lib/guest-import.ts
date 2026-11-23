import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_REGISTRATION_STATUSES } from "@/lib/duplicate-registration";
import { sendAttendeeConfirmationEmail } from "@/lib/email/attendee-confirmation";
import { getLimit } from "@/lib/entitlements";
import type { Event } from "@/lib/events";
import type { GuestRow } from "@/lib/guest-import-core";

export const TICKET_BATCH_SIZE = 10;
// Resend domyślnie przyjmuje 2 maile na sekundę.
const SEND_PAUSE_MS = 600;
const MAX_EXISTING = 10000;

export type GuestImportResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

export type TicketBatchResult = { sent: number; failed: string[]; remaining: number };

export type TicketResendResult = { ok: true } | { ok: false; error: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dodaje gości jako zatwierdzonych. Adres już zapisany na to wydarzenie jest pomijany, więc
 * ponowny import tej samej listy nic nie dubluje. Gość nie wyraził zgód, dlatego
 * gdpr_consent_at zostaje puste, a profil nie pojawia się w networkingu.
 */
export async function importGuests(
  event: { id: string; organization_id: string },
  guests: GuestRow[],
): Promise<GuestImportResult> {
  const db = createAdminClient();
  const { data: existing, error: readError } = await db
    .from("attendees")
    .select("email")
    .eq("event_id", event.id)
    .in("status", [...ACTIVE_REGISTRATION_STATUSES])
    .range(0, MAX_EXISTING - 1);
  if (readError) return { ok: false, error: "Nie udało się sprawdzić listy uczestników." };

  const taken = new Set((existing ?? []).map((a) => a.email?.trim().toLowerCase()));
  const fresh = guests.filter((g) => !taken.has(g.email));
  const skipped = guests.length - fresh.length;
  if (fresh.length === 0) return { ok: true, added: 0, skipped };

  const limit = await getLimit(event.organization_id, "max_attendees_per_event");
  if (limit != null && (existing ?? []).length + fresh.length > limit) {
    return { ok: false, error: `Import przekroczyłby limit ${limit} uczestników w Twoim planie.` };
  }

  const now = new Date().toISOString();
  const { error } = await db.from("attendees").insert(
    fresh.map((g) => ({
      event_id: event.id,
      first_name: g.firstName,
      last_name: g.lastName,
      email: g.email,
      company: g.company,
      job_title: g.jobTitle,
      status: "approved" as const,
      networking_visible: false,
      imported_at: now,
    })),
  );
  if (error) return { ok: false, error: "Nie udało się dodać gości. Nikt nie został zapisany." };
  return { ok: true, added: fresh.length, skipped };
}

/** Liczba zaimportowanych gości, którzy czekają na bilet. */
export async function countTicketQueue(eventId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("attendees")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "approved")
    .not("imported_at", "is", null)
    .is("ticket_sent_at", null);
  return count ?? 0;
}

/**
 * Jedna partia wysyłki. Wiersz jest zajmowany przed wysyłką (warunek ticket_sent_at IS NULL),
 * więc druga karta z tym samym przyciskiem nie wyśle biletu podwójnie. Po błędzie zajęcie jest
 * zwalniane, a osoba wraca do kolejki; `skipIds` chroni przed ponawianiem w tym samym przebiegu.
 */
export async function sendTicketBatch(
  event: Event,
  origin: string,
  skipIds: string[],
): Promise<TicketBatchResult> {
  const db = createAdminClient();
  const { data } = await db
    .from("attendees")
    .select("id, email, first_name, qr_code_token, check_in_token")
    .eq("event_id", event.id)
    .eq("status", "approved")
    .not("imported_at", "is", null)
    .is("ticket_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(TICKET_BATCH_SIZE + skipIds.length);

  const batch = (data ?? []).filter((a) => !skipIds.includes(a.id)).slice(0, TICKET_BATCH_SIZE);
  const failed: string[] = [];
  let sent = 0;

  for (const [i, guest] of batch.entries()) {
    if (i > 0) await wait(SEND_PAUSE_MS);
    const { data: claimed } = await db
      .from("attendees")
      .update({ ticket_sent_at: new Date().toISOString() })
      .eq("id", guest.id)
      .is("ticket_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    try {
      await sendAttendeeConfirmationEmail({
        to: guest.email,
        firstName: guest.first_name ?? "",
        event,
        qrCodeToken: guest.qr_code_token,
        checkInToken: guest.check_in_token,
        origin,
        templateType: "registration_approved",
      });
      sent++;
    } catch (error) {
      console.error("[guest-import] ticket email failed:", error instanceof Error ? error.message : "unknown");
      await db.from("attendees").update({ ticket_sent_at: null }).eq("id", guest.id);
      failed.push(guest.id);
    }
  }

  return { sent, failed, remaining: await countTicketQueue(event.id) };
}

/** Bilet dla jednej osoby: pierwszy albo ponowny, także dla zapisanych samodzielnie. */
export async function resendTicket(
  event: Event,
  origin: string,
  attendeeId: string,
): Promise<TicketResendResult> {
  const db = createAdminClient();
  const { data: attendee } = await db
    .from("attendees")
    .select("email, first_name, status, qr_code_token, check_in_token")
    .eq("id", attendeeId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (!attendee || attendee.status !== "approved" || !attendee.email) {
    return { ok: false, error: "Bilet można wysłać tylko zatwierdzonej osobie z adresem e-mail." };
  }

  try {
    await sendAttendeeConfirmationEmail({
      to: attendee.email,
      firstName: attendee.first_name ?? "",
      event,
      qrCodeToken: attendee.qr_code_token,
      checkInToken: attendee.check_in_token,
      origin,
      templateType: "registration_approved",
    });
  } catch (error) {
    console.error("[guest-import] ticket email failed:", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: "Nie udało się wysłać biletu. Spróbuj ponownie." };
  }
  await db.from("attendees").update({ ticket_sent_at: new Date().toISOString() }).eq("id", attendeeId);
  return { ok: true };
}
