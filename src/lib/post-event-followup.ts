import { createAdminClient } from "@/lib/supabase/admin";
import { getEventFollowupRecipients } from "@/lib/contact-requests";
import { sendPostEventFollowupEmail } from "@/lib/email/post-event-followup";

// Okno wyboru eventów: ends_at między 7 dniami a 18h temu. Cron chodzi codziennie
// o 08:00 UTC; szerokie okno nadrabia pominięte uruchomienia crona i eventy
// zakończone tuż przed wdrożeniem tej reguły. Jednokrotność zapewnia
// followup_sent_at (filtr + warunkowa rezerwacja), nie szerokość okna.
// O kwalifikacji decyduje godzina zakończenia z harmonogramu, nie ręczna zmiana
// statusu przez organizatora (event po terminie często zostaje „live”).
export const WINDOW_MIN_HOURS = 18;
export const WINDOW_MAX_HOURS = 7 * 24;
const HOUR_MS = 60 * 60 * 1000;

/** Statusy, przy których event się odbył. Szkic i archiwum pomijamy. */
export const FOLLOWUP_STATUSES = ["published", "live", "completed"] as const;

export type FollowupRunResult = { events: number; emails: number; failed: number };

export function followupWindow(now: number): { start: string; end: string } {
  return {
    start: new Date(now - WINDOW_MAX_HOURS * HOUR_MS).toISOString(),
    end: new Date(now - WINDOW_MIN_HOURS * HOUR_MS).toISOString(),
  };
}

export async function runPostEventFollowup(now: number = Date.now()): Promise<FollowupRunResult> {
  const supabase = createAdminClient();
  const { start, end } = followupWindow(now);

  const { data: candidates } = await supabase
    .from("events")
    .select("id, name, organization_id")
    .in("status", [...FOLLOWUP_STATUSES])
    .is("deleted_at", null)
    .is("followup_sent_at", null)
    .gte("ends_at", start)
    .lte("ends_at", end);

  let processed = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const event of candidates ?? []) {
    const [eventSus, orgSus] = await Promise.all([
      supabase.from("event_suspensions").select("event_id").eq("event_id", event.id).maybeSingle(),
      supabase
        .from("organization_suspensions")
        .select("organization_id")
        .eq("organization_id", event.organization_id)
        .maybeSingle(),
    ]);
    // Zawieszony event pomijamy bez stempla — po zdjęciu zawieszenia w oknie wyśle się normalnie.
    if (eventSus.data || orgSus.data) continue;

    // Rezerwacja przed wysyłką: warunkowy update wygrywa tylko jedno uruchomienie,
    // więc równoległy lub powtórny cron nie roześle maili drugi raz.
    // Świadomie bez ponawiania po błędach pojedynczych maili: retry całego eventu
    // rozesłałby duplikaty do tych, którym mail już poszedł.
    const { data: claimed } = await supabase
      .from("events")
      .update({ followup_sent_at: new Date(now).toISOString() })
      .eq("id", event.id)
      .is("followup_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    processed += 1;

    const recipients = await getEventFollowupRecipients(event.id);
    for (const recipient of recipients) {
      if (!recipient.email || recipient.contacts.length === 0) continue;
      try {
        await sendPostEventFollowupEmail({
          to: recipient.email,
          firstName: recipient.first_name,
          eventName: event.name,
          contacts: recipient.contacts,
        });
        emailsSent += 1;
      } catch (error) {
        // Sandbox Resend odrzuca adresy inne niż zweryfikowany — jeden błąd nie
        // może przerwać wysyłki do pozostałych. Logujemy i liczymy.
        emailsFailed += 1;
        console.error(
          `[post-event-followup] mail nie wyszedł (event ${event.id}):`,
          error instanceof Error ? error.message : "unknown",
        );
      }
    }
  }

  return { events: processed, emails: emailsSent, failed: emailsFailed };
}
