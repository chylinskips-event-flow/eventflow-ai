import type { Session } from "@/lib/sessions";
import { formatTimeRange, getCurrentTimestamp, isSessionOngoing } from "@/lib/format";
import type { Speaker } from "@/lib/speakers";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AgendaToggleButton } from "./agenda-toggle-button";

const dayFormatter = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function speakerName(speaker: Speaker | undefined) {
  if (!speaker) return null;
  return [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || null;
}

export function AgendaSessionList({
  slug,
  sessions,
  speakerMap,
  agendaSessionIds,
  isLive,
  readOnly = false,
}: {
  slug: string;
  sessions: Session[];
  speakerMap: Map<string, Speaker>;
  agendaSessionIds?: Set<string>;
  isLive: boolean;
  readOnly?: boolean;
}) {
  const now = getCurrentTimestamp();

  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = session.starts_at
      ? new Date(session.starts_at).toDateString()
      : "no-date";
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(groups.entries()).map(([key, group]) => (
        <div key={key} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {key === "no-date"
              ? "Bez ustalonej daty"
              : dayFormatter.format(new Date(group[0].starts_at!))}
          </h2>
          {group.map((session) => {
            const isOngoing = isLive && isSessionOngoing(session, now);

            const speaker = speakerName(
              session.speaker_id ? speakerMap.get(session.speaker_id) : undefined,
            );

            return (
              <Card
                key={session.id}
                className={cn(
                  "border-l-4 border-l-primary bg-primary/5",
                  isOngoing && "border-primary",
                )}
              >
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{session.title}</span>
                      {isOngoing && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Trwa teraz
                        </span>
                      )}
                    </div>
                    {(session.starts_at || session.ends_at) && (
                      <span className="text-sm text-muted-foreground">
                        {formatTimeRange(session.starts_at, session.ends_at)}
                      </span>
                    )}
                    {(session.room || session.track) && (
                      <span className="text-sm text-muted-foreground">
                        {[session.room, session.track].filter(Boolean).map((val) => `· ${val}`).join(" ")}
                      </span>
                    )}
                    {speaker && (
                      <span className="text-sm text-muted-foreground">
                        {speaker}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <AgendaToggleButton
                      slug={slug}
                      sessionId={session.id}
                      initialInAgenda={agendaSessionIds?.has(session.id) ?? false}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
