import type { Metadata } from "next";
import Link from "next/link";
import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
  isCurrentUserEventOwner,
} from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventSessions, getEventSessionsForParticipant } from "@/lib/sessions";
import { getEventSpeakers, getEventSpeakersForParticipant } from "@/lib/speakers";
import { getAttendeeAgendaSessionIds } from "@/lib/agenda-items";
import {
  getEventContentSections,
  getEventContentSectionsForPreview,
} from "@/lib/event-content";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaSessionList } from "./agenda/agenda-session-list";
import { SpeakerList } from "./speaker-list";
import { ContentSections } from "./content-sections";
import { LiveNow } from "./live-now";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlugForRegistration(slug);

  if (!event) return {};

  // event_content_sections has no RLS policy yet (blocked for anon) — use admin client.
  const supabase = createAdminClient();
  const { data: sections } = await supabase
    .from("event_content_sections")
    .select("body")
    .eq("event_id", event.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  let description: string;
  if (sections?.body) {
    description = sections.body.slice(0, 160);
  } else {
    const dateStr = formatDate(event.starts_at, event.timezone);
    description = dateStr ? `${event.name} · ${dateStr}` : event.name;
  }

  const ogImage = event.banner_url ?? event.logo_url ?? undefined;

  return {
    title: event.name,
    description,
    openGraph: {
      type: "website",
      title: event.name,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}


export default async function ParticipantEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
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

  // Tryb podglądu: tylko właściciel eventu i tylko z jawnym ?preview=1. Param
  // sam w sobie nic nie robi bez własności. W podglądzie ignorujemy cookie
  // uczestnika (organizator z własnym tokenem testowym zobaczyłby "Cześć,
  // [imię]!" zamiast strony marketingowej) i pomijamy bramkę "niedostępne",
  // żeby draft też był widoczny — z banerem podglądu.
  const previewMode = preview === "1" && (await isCurrentUserEventOwner(event));

  // Zatwierdzony uczestnik ma dostęp niezależnie od późniejszej zmiany statusu
  // eventu (completed/archived) - celowe. Po evencie uczestnicy mają widzieć
  // listę poznanych osób i rekomendacje kontaktów (moduł post-event/networking,
  // patrz plan produktu) - to wymaga zachowania dostępu po zakończeniu eventu,
  // nie tylko w trakcie.
  const attendee = previewMode ? null : await getCurrentAttendee(slug);

  if (attendee) {
    const navButtons = (
      <div className="flex flex-col gap-2">
        <Button asChild>
          <Link href={`/e/${slug}/agenda`}>Agenda</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/e/${slug}/my-agenda`}>Moja agenda</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/e/${slug}/attendees`}>Uczestnicy</Link>
        </Button>
      </div>
    );

    if (event.status === "live") {
      const [sessions, speakers, agendaSessionIds] = await Promise.all([
        getEventSessionsForParticipant(event.id),
        getEventSpeakersForParticipant(event.id),
        getAttendeeAgendaSessionIds(attendee.id),
      ]);
      const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));

      return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
          <div>
            <h1 className="text-2xl font-semibold">
              Cześć, {attendee.first_name}!
            </h1>
            <p className="text-muted-foreground">{event.name}</p>
          </div>
          <LiveNow
            slug={slug}
            sessions={sessions}
            speakerMap={speakerMap}
            agendaSessionIds={agendaSessionIds}
            timezone={event.timezone}
          />
          {navButtons}
        </main>
      );
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Cześć, {attendee.first_name}!</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">{event.name}</p>

            {event.status === "completed" || event.status === "archived" ? (
              <p className="text-sm text-muted-foreground">
                Wydarzenie zakończone.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Wydarzenie jeszcze się nie rozpoczęło.
              </p>
            )}

            {navButtons}
          </CardContent>
        </Card>
      </main>
    );
  }

  const unavailableReason = previewMode
    ? null
    : getRegistrationUnavailableReason(event);

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

  // W trybie podglądu (własność potwierdzona) czytamy przez service_role —
  // publiczne polityki RLS ujawniają te dane tylko dla published/live, więc
  // draft inaczej dałby pustą stronę bez agendy/prelegentów/sekcji.
  const [sections, sessions, speakers] = previewMode
    ? await Promise.all([
        getEventContentSectionsForPreview(event.id),
        getEventSessionsForParticipant(event.id),
        getEventSpeakersForParticipant(event.id),
      ])
    : await Promise.all([
        getEventContentSections(event.id),
        getEventSessions(event.id),
        getEventSpeakers(event.id),
      ]);

  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));

  const navLinks = [
    sections.length > 0 ? { href: "#about", label: "O wydarzeniu" } : null,
    speakers.length > 0 ? { href: "#speakers", label: "Prelegenci" } : null,
    sessions.length > 0 ? { href: "#agenda", label: "Agenda" } : null,
    { href: "#register", label: "Rejestracja" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  const showPreviewBanner =
    previewMode && event.status !== "published" && event.status !== "live";

  return (
    <main className="flex flex-col">
      {showPreviewBanner && (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
          Podgląd — wydarzenie nie jest jeszcze opublikowane. Widzisz je jako
          organizator; uczestnicy jeszcze go nie widzą.
        </div>
      )}
      {event.banner_url ? (
        <img
          src={event.banner_url}
          alt={event.name}
          className="w-full aspect-[2/1] lg:max-h-[480px] lg:aspect-auto 2xl:max-h-[600px] object-cover object-top"
        />
      ) : (
        <div className="flex w-full aspect-[2/1] lg:max-h-[480px] lg:aspect-auto lg:h-[480px] 2xl:max-h-[600px] 2xl:h-[600px] items-center justify-center bg-primary">
          <span className="px-4 text-center text-2xl font-semibold text-primary-foreground">
            {event.name}
          </span>
        </div>
      )}

      {navLinks.length > 0 && (
        <nav className="flex flex-wrap justify-center gap-4 border-b px-4 py-3 text-sm">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      <div className="mx-auto mb-8 flex w-full max-w-4xl flex-col gap-6 p-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-4">
          <Badge variant="secondary" className="w-fit">
            WYDARZENIE
          </Badge>
          <h1 className="text-3xl font-bold md:text-4xl">{event.name}</h1>
          {(event.starts_at || event.location) && (
            <p className="text-lg text-muted-foreground">
              {event.starts_at && formatDateTime(event.starts_at, event.timezone)}
              {event.starts_at &&
                event.ends_at &&
                ` – ${formatDateTime(event.ends_at, event.timezone)}`}
              {event.starts_at && event.location && " · "}
              {event.location}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={`/e/${slug}/register`}>Zarejestruj się →</Link>
            </Button>
            {sessions.length > 0 && (
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <a href="#agenda">Zobacz agendę</a>
              </Button>
            )}
          </div>
        </div>

        {(speakers.length > 0 || sessions.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {speakers.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-3">
                <span className="text-2xl font-bold text-primary">{speakers.length}</span>
                <span className="text-sm text-muted-foreground">Prelegentów</span>
              </div>
            )}
            {sessions.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-3">
                <span className="text-2xl font-bold text-primary">{sessions.length}</span>
                <span className="text-sm text-muted-foreground">Sesji</span>
              </div>
            )}
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div id="about" className="mx-auto w-full max-w-4xl p-4">
          <ContentSections sections={sections} />
        </div>
      )}

      {speakers.length > 0 && (
        <div id="speakers" className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
          <h2 className="text-xl font-semibold">Prelegenci</h2>
          <SpeakerList speakers={speakers} />
        </div>
      )}

      {sessions.length > 0 && (
        <div id="agenda" className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
          <h2 className="text-xl font-semibold">Agenda</h2>
          <AgendaSessionList
            slug={slug}
            sessions={sessions}
            speakerMap={speakerMap}
            isLive={event.status === "live"}
            timezone={event.timezone}
            readOnly
          />
        </div>
      )}

      <div id="register" className="bg-secondary">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 p-8 text-center">
          <h2 className="text-2xl font-bold">Dołącz do nas!</h2>
          <p className="text-muted-foreground">
            Miejsca są ograniczone — zarezerwuj swoje już teraz.
          </p>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/e/${slug}/register`}>Zarejestruj się</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
