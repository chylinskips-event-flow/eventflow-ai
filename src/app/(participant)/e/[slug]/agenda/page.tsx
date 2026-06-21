import { redirect } from "next/navigation";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventSessionsForParticipant } from "@/lib/sessions";
import { getEventSpeakersForParticipant } from "@/lib/speakers";
import { getAttendeeAgendaSessionIds } from "@/lib/agenda-items";
import { Card, CardContent } from "@/components/ui/card";
import { AgendaSessionList } from "./agenda-session-list";

export default async function AgendaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    redirect(`/e/${slug}`);
  }

  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    redirect(`/e/${slug}`);
  }

  const [sessions, speakers, agendaSessionIds] = await Promise.all([
    getEventSessionsForParticipant(event.id),
    getEventSpeakersForParticipant(event.id),
    getAttendeeAgendaSessionIds(attendee.id),
  ]);

  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Agenda — {event.name}</h1>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Brak sesji w agendzie tego wydarzenia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AgendaSessionList
          slug={slug}
          sessions={sessions}
          speakerMap={speakerMap}
          agendaSessionIds={agendaSessionIds}
          isLive={event.status === "live"}
        />
      )}
    </main>
  );
}
