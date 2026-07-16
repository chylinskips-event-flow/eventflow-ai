import type { Session } from "@/lib/sessions";
import {
  formatDay,
  formatSessionSpeakers,
  formatTimeRange,
  getCurrentTimestamp,
  getDateGroupKey,
  isSessionOngoing,
} from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AgendaToggleButton } from "./agenda-toggle-button";

export function AgendaSessionList({
  slug,
  sessions,
  agendaSessionIds,
  isLive,
  timezone,
  readOnly = false,
}: {
  slug: string;
  sessions: Session[];
  agendaSessionIds?: Set<string>;
  isLive: boolean;
  timezone: string | null;
  readOnly?: boolean;
}) {
  const now = getCurrentTimestamp();

  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = getDateGroupKey(session.starts_at, timezone);
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
              : formatDay(group[0].starts_at, timezone)}
          </h2>
          {group.map((session) => {
            const isOngoing = isLive && isSessionOngoing(session, now);

            const speaker = formatSessionSpeakers(session.speakers);

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
                        {formatTimeRange(session.starts_at, session.ends_at, timezone)}
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
