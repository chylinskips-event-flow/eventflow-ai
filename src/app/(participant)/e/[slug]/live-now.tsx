import Link from "next/link";
import type { Session } from "@/lib/sessions";
import type { Speaker } from "@/lib/speakers";
import { formatTime, getCurrentTimestamp, isSessionOngoing } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

function speakerName(speaker: Speaker | undefined) {
  if (!speaker) return null;
  return [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || null;
}

function AgendaBadge() {
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
      ★ W Twojej agendzie
    </span>
  );
}

export function LiveNow({
  slug,
  sessions,
  speakerMap,
  agendaSessionIds,
  timezone,
}: {
  slug: string;
  sessions: Session[];
  speakerMap: Map<string, Speaker>;
  agendaSessionIds: Set<string>;
  timezone: string | null;
}) {
  // TODO(post-MVP): auto-odświeżanie tej sekcji co ~30s (router.refresh po
  // stronie klienta albo revalidate), żeby "teraz trwa" aktualizowało się bez
  // ręcznego odświeżania strony. Na MVP uczestnik odświeża stronę sam.
  const now = getCurrentTimestamp();

  const ongoing = sessions.filter((session) => isSessionOngoing(session, now));
  const upcoming = sessions
    .filter(
      (session) =>
        session.starts_at && new Date(session.starts_at).getTime() > now,
    )
    .slice(0, 3);
  const nextStart = upcoming[0]?.starts_at ?? null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Teraz trwa</h2>
        {ongoing.length > 0 ? (
          ongoing.map((session) => {
            const speaker = speakerName(
              session.speaker_id
                ? speakerMap.get(session.speaker_id)
                : undefined,
            );
            const until = formatTime(session.ends_at, timezone);
            const details = [session.room, speaker].filter(Boolean).join(" · ");

            return (
              <Card
                key={session.id}
                className="border-l-4 border-l-primary border-primary bg-primary/5"
              >
                <CardContent className="flex flex-col gap-1 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{session.title}</span>
                    {agendaSessionIds.has(session.id) && <AgendaBadge />}
                  </div>
                  {details && (
                    <span className="text-sm text-muted-foreground">
                      {details}
                    </span>
                  )}
                  {until && (
                    <span className="text-sm text-muted-foreground">
                      do {until}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-l-4 border-l-muted bg-muted/30">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">
                {nextStart
                  ? `Przerwa — następna sesja o ${formatTime(nextStart, timezone)}`
                  : "Brak zaplanowanych sesji."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Za chwilę</h2>
          {upcoming.map((session) => {
            const at = formatTime(session.starts_at, timezone);
            const meta = [at ? `o ${at}` : null, session.room]
              .filter(Boolean)
              .join(" · ");

            return (
              <Card key={session.id}>
                <CardContent className="flex flex-col gap-1 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{session.title}</span>
                    {agendaSessionIds.has(session.id) && <AgendaBadge />}
                  </div>
                  {meta && (
                    <span className="text-sm text-muted-foreground">{meta}</span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Link
        href={`/e/${slug}/agenda`}
        className="text-sm font-medium text-primary hover:underline"
      >
        Pełna agenda →
      </Link>
    </section>
  );
}
