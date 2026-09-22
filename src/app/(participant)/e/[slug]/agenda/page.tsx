import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventSessionsForParticipant } from "@/lib/sessions";
import { getAttendeeAgendaSessionIds } from "@/lib/agenda-items";
import { getDateGroupKey } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHero } from "@/components/participant/section-hero";
import { DaySelector } from "./day-selector";
import type { DayOption } from "./day-selector";
import { AgendaSessionList } from "./agenda-session-list";

function shortDayLabel(
  startsAt: string,
  timezone: string | null,
): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(startsAt));
}

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { slug } = await params;
  const { day: dayParam } = await searchParams;

  const attendee = await getCurrentAttendee(slug);
  if (!attendee) redirect(`/e/${slug}`);

  const event = await getEventBySlugForRegistration(slug);
  if (!event) redirect(`/e/${slug}`);

  const [sessions, agendaSessionIds] = await Promise.all([
    getEventSessionsForParticipant(event.id),
    getAttendeeAgendaSessionIds(attendee.id),
  ]);

  // Build ordered unique-day list (server-side, no client state needed)
  const dayKeys: string[] = [];
  const firstSessionPerDay = new Map<string, string>(); // key → starts_at

  for (const session of sessions) {
    const key = getDateGroupKey(session.starts_at, event.timezone);
    if (!firstSessionPerDay.has(key)) {
      dayKeys.push(key);
      if (session.starts_at) firstSessionPerDay.set(key, session.starts_at);
    }
  }

  const dateDayKeys = dayKeys.filter((k) => k !== "no-date");
  const isMultiDay = dateDayKeys.length > 1;

  const dayOptions: DayOption[] = isMultiDay
    ? [
        { key: "all", label: "Wszystkie dni" },
        ...dateDayKeys.map((key) => {
          const startsAt = firstSessionPerDay.get(key);
          return {
            key,
            label: startsAt ? shortDayLabel(startsAt, event.timezone) : key,
          };
        }),
        ...(firstSessionPerDay.has("no-date")
          ? [{ key: "no-date", label: "Bez daty" }]
          : []),
      ]
    : [];

  const activeDay = isMultiDay && dayParam ? dayParam : "all";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Twój plan na"
        headlineAccent="wyjątkowy dzień"
        subtitle="Prelekcje, panele, warsztaty i networking. Sprawdź, co Cię czeka!"
      />

      {isMultiDay && (
        <DaySelector days={dayOptions} active={activeDay} />
      )}

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CalendarDays className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Organizator jeszcze nie opublikował agendy tego wydarzenia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AgendaSessionList
          slug={slug}
          sessions={sessions}
          agendaSessionIds={agendaSessionIds}
          isLive={event.status === "live"}
          timezone={event.timezone}
          activeDay={activeDay}
        />
      )}
    </main>
  );
}
