import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventSessions } from "@/lib/sessions";
import { getEventSpeakers } from "@/lib/speakers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SessionFormDialog } from "./session-form-dialog";
import { SessionList } from "./session-list";

export default async function EventSessionsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  const [sessions, speakers] = await Promise.all([
    getEventSessions(eventId),
    getEventSpeakers(eventId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <SessionFormDialog
          eventId={eventId}
          speakers={speakers}
          existingSessions={sessions}
          eventStartsAt={event.starts_at}
          eventEndsAt={event.ends_at}
          trigger={<Button>Dodaj sesję</Button>}
        />
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych sesji w agendzie.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SessionList
          eventId={eventId}
          sessions={sessions}
          speakers={speakers}
          eventStartsAt={event.starts_at}
          eventEndsAt={event.ends_at}
        />
      )}
    </main>
  );
}
