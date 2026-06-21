import Link from "next/link";
import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
} from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventSessionsForParticipant } from "@/lib/sessions";
import { formatTimeRange } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dateRangeFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function findNowOrNextSession<T extends { starts_at: string | null; ends_at: string | null }>(
  sessions: T[],
): { session: T; isOngoing: boolean } | null {
  const now = Date.now();

  for (const session of sessions) {
    if (!session.starts_at || !session.ends_at) continue;
    const start = new Date(session.starts_at).getTime();
    const end = new Date(session.ends_at).getTime();
    if (now >= start && now <= end) {
      return { session, isOngoing: true };
    }
  }

  const upcoming = sessions.find(
    (session) => session.starts_at && new Date(session.starts_at).getTime() > now,
  );

  return upcoming ? { session: upcoming, isOngoing: false } : null;
}

export default async function ParticipantEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Wydarzenie nie zostało znalezione</CardTitle>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // Zatwierdzony uczestnik ma dostęp niezależnie od późniejszej zmiany statusu
  // eventu (completed/archived) - celowe. Po evencie uczestnicy mają widzieć
  // listę poznanych osób i rekomendacje kontaktów (moduł post-event/networking,
  // patrz plan produktu) - to wymaga zachowania dostępu po zakończeniu eventu,
  // nie tylko w trakcie.
  const attendee = await getCurrentAttendee(slug);

  if (attendee) {
    const sessions =
      event.status === "live" ? await getEventSessionsForParticipant(event.id) : [];
    const nowOrNext = event.status === "live" ? findNowOrNextSession(sessions) : null;

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Cześć, {attendee.first_name}!</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">{event.name}</p>

            {event.status === "live" ? (
              nowOrNext ? (
                <div className="rounded-md border border-primary p-3">
                  <p className="text-xs font-medium text-primary">
                    {nowOrNext.isOngoing ? "Teraz trwa" : "Następna sesja"}
                  </p>
                  <p className="font-medium">{nowOrNext.session.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeRange(
                      nowOrNext.session.starts_at,
                      nowOrNext.session.ends_at,
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Brak zaplanowanych sesji w tej chwili.
                </p>
              )
            ) : event.status === "completed" || event.status === "archived" ? (
              <p className="text-sm text-muted-foreground">
                Wydarzenie zakończone.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Wydarzenie jeszcze się nie rozpoczęło.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link href={`/e/${slug}/agenda`}>Agenda</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/e/${slug}/my-agenda`}>Moja agenda</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const unavailableReason = getRegistrationUnavailableReason(event);

  if (unavailableReason) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{event.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{unavailableReason}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{event.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {event.starts_at && (
            <p className="text-sm text-muted-foreground">
              {dateRangeFormatter.format(new Date(event.starts_at))}
              {event.ends_at &&
                ` – ${dateRangeFormatter.format(new Date(event.ends_at))}`}
            </p>
          )}
          {event.location && (
            <p className="text-sm text-muted-foreground">{event.location}</p>
          )}
          <Button asChild size="lg">
            <Link href={`/e/${slug}/register`}>Zarejestruj się</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
