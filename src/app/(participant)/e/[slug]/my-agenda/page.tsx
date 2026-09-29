import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { getEventSessionsForParticipant } from "@/lib/sessions";
import { getAttendeeAgendaSessionIds } from "@/lib/agenda-items";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgendaSessionList } from "../agenda/agenda-session-list";

export default async function MyAgendaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    redirect(eventRoot);
  }

  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    redirect(eventRoot);
  }

  // Prelegenci przychodzą razem z sesjami (nested select).
  const [allSessions, agendaSessionIds] = await Promise.all([
    getEventSessionsForParticipant(event.id),
    getAttendeeAgendaSessionIds(attendee.id),
  ]);

  const sessions = allSessions.filter((session) => agendaSessionIds.has(session.id));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={eventRoot}>
          <ArrowLeft className="size-4" /> Powrót
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">Moja agenda – {event.name}</h1>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych sesji w swojej agendzie. Przejdź do
              pełnej agendy i dodaj te, które Cię interesują.
            </p>
            <Button asChild>
              <Link href={buildEventInternalPath(slug, "/agenda", origin)}>Przejdź do pełnej agendy</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AgendaSessionList
          slug={slug}
          sessions={sessions}
          agendaSessionIds={agendaSessionIds}
          isLive={event.status === "live"}
          timezone={event.timezone}
        />
      )}
    </main>
  );
}
