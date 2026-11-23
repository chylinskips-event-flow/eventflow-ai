import { NextResponse, type NextRequest } from "next/server";
import { runPostEventFollowup } from "@/lib/post-event-followup";

// Resend wymaga Node (nie Edge); nagłówek autoryzacji czyni trasę dynamiczną.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Kwalifikacja po ends_at (18–42 h temu), bez usuniętych i zawieszonych;
  // followup_sent_at rezerwowany przed wysyłką gwarantuje jednokrotność.
  return NextResponse.json(await runPostEventFollowup());
}
