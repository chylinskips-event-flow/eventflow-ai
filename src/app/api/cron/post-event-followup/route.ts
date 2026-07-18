import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventFollowupRecipients } from "@/lib/contact-requests";
import { sendPostEventFollowupEmail } from "@/lib/email/post-event-followup";

// Resend wymaga Node (nie Edge); nagłówek autoryzacji czyni trasę dynamiczną.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Okno wyboru eventów: zakończone między 42h a 18h temu. Cron chodzi codziennie
// o 08:00 UTC, więc każdy zakończony event trafia w to okno dokładnie raz —
// followup_sent_at gwarantuje jednokrotność nawet gdyby cron ruszył dwa razy.
const WINDOW_MIN_HOURS = 18;
const WINDOW_MAX_HOURS = 42;
const HOUR_MS = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  // Vercel Cron dokłada nagłówek Authorization: Bearer <CRON_SECRET>, gdy
  // CRON_SECRET jest w env. Brak sekretu w env traktujemy jak brak autoryzacji,
  // żeby endpoint nie był otwarty.
  const secret = process.env.CRON_SECRET;
  const authorized =
    Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`;

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MAX_HOURS * HOUR_MS).toISOString();
  const windowEnd = new Date(now - WINDOW_MIN_HOURS * HOUR_MS).toISOString();

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .eq("status", "completed")
    .is("followup_sent_at", null)
    .gte("ends_at", windowStart)
    .lte("ends_at", windowEnd);

  let emailsSent = 0;
  let emailsFailed = 0;

  for (const event of events ?? []) {
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
          `[post-event-followup] mail do ${recipient.email} (event ${event.id}):`,
          error,
        );
      }
    }

    // Stempel po przetworzeniu eventu — kolejne uruchomienia go pomijają.
    // Świadomie stemplujemy nawet gdy część maili failowała: retry całego
    // eventu rozesłałby duplikaty do tych, którym mail już poszedł.
    await supabase
      .from("events")
      .update({ followup_sent_at: new Date().toISOString() })
      .eq("id", event.id);
  }

  return NextResponse.json({
    events: events?.length ?? 0,
    emails: emailsSent,
    failed: emailsFailed,
  });
}
