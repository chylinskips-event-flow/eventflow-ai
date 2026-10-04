import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, MapPin } from "lucide-react";
import { getEventBySlugForRegistration, getRegistrationUnavailableReason } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { getEventSessionById } from "@/lib/sessions";
import { formatDay, formatTimeRange, getCurrentTimestamp, isSessionOngoing } from "@/lib/format";
import { hasFeature } from "@/lib/entitlements";
import { getParticipantEngagement } from "@/lib/engagement";
import { canAskQuestions, canRateSession, type EventStatus } from "@/lib/engagement-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SessionEngagement } from "./session-engagement";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";
  const agendaHref = buildEventInternalPath(slug, "/agenda", origin);

  const [attendee, event] = await Promise.all([
    getCurrentAttendee(slug),
    getEventBySlugForRegistration(slug),
  ]);
  if (!event) redirect(eventRoot);
  if (!UUID.test(sessionId)) notFound();

  if (!attendee) {
    // Np. wejście z kodu QR na rzutniku na telefonie bez zalogowanego uczestnika —
    // zamiast cichego przekierowania mówimy, co zrobić.
    const isPublic = event.status === "published" || event.status === "live";
    if (!isPublic) redirect(eventRoot);
    const session = await getEventSessionById(event.id, sessionId);
    if (!session) notFound();
    const canRegister = getRegistrationUnavailableReason(event) === null;
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 p-4 pb-8">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{event.name}</p>
          <h1 className="text-2xl font-semibold leading-tight">{session.title}</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <p className="font-medium">Aby zadawać pytania i głosować, wejdź jako uczestnik.</p>
            <p className="text-sm text-muted-foreground">
              Jesteś już zarejestrowany? Otwórz na tym telefonie link z maila potwierdzającego
              rejestrację (albo zeskanuj kod QR ze swojego biletu), a potem wróć do tej strony.
            </p>
            {canRegister && (
              <Button asChild>
                <Link href={buildEventInternalPath(slug, "/register", origin)}>Zarejestruj się</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={eventRoot}>Strona wydarzenia</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }
  if (event.id !== attendee.event_id) redirect(eventRoot);

  const session = await getEventSessionById(event.id, sessionId);
  if (!session) notFound();

  const status = event.status as EventStatus;
  const liveQa = await hasFeature(event.organization_id, "live_qa");
  const engagement = liveQa ? await getParticipantEngagement(session.id, attendee.id) : null;
  const now = new Date(getCurrentTimestamp());
  const isOngoing = status === "live" && isSessionOngoing(session, now.getTime());
  const timeRange = formatTimeRange(session.starts_at, session.ends_at, event.timezone);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <Link
        href={agendaHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Agenda
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isOngoing && <Badge variant="success">Trwa teraz</Badge>}
          {session.track && <Badge variant="outline">{session.track}</Badge>}
        </div>
        <h1 className="text-2xl font-semibold leading-tight">{session.title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {session.starts_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-4" />
              {formatDay(session.starts_at, event.timezone)}
              {timeRange ? `, ${timeRange}` : ""}
            </span>
          )}
          {session.room && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" />
              {session.room}
            </span>
          )}
        </div>
        {session.speakers.length > 0 && (
          <p className="text-sm">
            {session.speakers
              .map(({ speaker, role }) => {
                const name = [speaker.first_name, speaker.last_name].filter(Boolean).join(" ");
                return role === "moderator" ? `${name} (moderacja)` : name;
              })
              .join(", ")}
          </p>
        )}
        {session.description && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{session.description}</p>
        )}
      </header>

      {engagement && (
        <SessionEngagement
          slug={slug}
          sessionId={session.id}
          engagement={engagement}
          canAsk={canAskQuestions(status)}
          canRate={canRateSession(session, status, now)}
          autoRefresh={status === "live" || status === "published"}
          speakers={session.speakers.map(({ speaker }) => ({
            id: speaker.id,
            name: [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || "Prelegent",
          }))}
        />
      )}
    </main>
  );
}
