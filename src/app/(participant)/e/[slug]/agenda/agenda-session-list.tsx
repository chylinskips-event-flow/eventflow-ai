import { CalendarDays } from "lucide-react";
import type { Session } from "@/lib/sessions";
import {
  formatDay,
  formatTime,
  formatTimeRange,
  getCurrentTimestamp,
  getDateGroupKey,
  isSessionOngoing,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AgendaToggleButton } from "./agenda-toggle-button";

type SpeakerEntry = {
  speaker: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    company: string | null;
  };
  role: string;
};

function SpeakerChip({ entry }: { entry: SpeakerEntry }) {
  const { speaker, role } = entry;
  const name = [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || "—";
  const initials = [speaker.first_name?.[0], speaker.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex items-center gap-1.5">
      {speaker.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={speaker.photo_url}
          alt={name}
          width={20}
          height={20}
          className="size-5 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">
          {initials}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {role === "moderator" ? `Mod.: ${name}` : name}
        {speaker.company ? ` · ${speaker.company}` : ""}
      </span>
    </div>
  );
}

export function AgendaSessionList({
  slug,
  sessions,
  agendaSessionIds,
  isLive,
  timezone,
  readOnly = false,
  activeDay,
}: {
  slug: string;
  sessions: Session[];
  agendaSessionIds?: Set<string>;
  isLive: boolean;
  timezone: string | null;
  readOnly?: boolean;
  activeDay?: string;
}) {
  const now = getCurrentTimestamp();

  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = getDateGroupKey(session.starts_at, timezone);
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }

  const entries =
    activeDay && activeDay !== "all"
      ? Array.from(groups.entries()).filter(([key]) => key === activeDay)
      : Array.from(groups.entries());

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CalendarDays className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Brak sesji w wybranym dniu.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {entries.map(([key, group]) => (
        <div key={key}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {key === "no-date"
              ? "Bez ustalonej daty"
              : formatDay(group[0].starts_at, timezone)}
          </h2>

          <div className="flex flex-col">
            {group.map((session, idx) => {
              const isOngoing = isLive && isSessionOngoing(session, now);
              const isLast = idx === group.length - 1;
              const startTime = formatTime(session.starts_at, timezone);
              const timeRange = formatTimeRange(
                session.starts_at,
                session.ends_at,
                timezone,
              );

              return (
                <div key={session.id} className="flex gap-2">
                  {/* Time column */}
                  <div className="w-12 shrink-0 pt-1.5 text-right text-[11px] font-mono tabular-nums text-muted-foreground">
                    {startTime ?? "—"}
                  </div>

                  {/* Dot + connecting line */}
                  <div className="flex w-4 shrink-0 flex-col items-center">
                    <div
                      className={cn(
                        "mt-1.5 size-2.5 shrink-0 rounded-full",
                        isOngoing
                          ? "bg-green-500 ring-2 ring-green-500/30"
                          : "bg-primary ring-2 ring-primary/20",
                      )}
                    />
                    {!isLast && (
                      <div className="mb-1 mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>

                  {/* Card */}
                  <div
                    className={cn(
                      "mb-3 flex-1 rounded-xl border bg-card p-3 shadow-sm",
                      isOngoing &&
                        "border-green-500/30 bg-green-50/40 dark:bg-green-900/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        {/* Badges row */}
                        {(isOngoing || session.track) && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isOngoing && (
                              <Badge variant="success">Trwa teraz</Badge>
                            )}
                            {session.track && (
                              <Badge variant="outline">{session.track}</Badge>
                            )}
                          </div>
                        )}

                        {/* Title */}
                        <span className="font-semibold leading-snug">
                          {session.title}
                        </span>

                        {/* Time range (shown only when ends_at present) */}
                        {session.ends_at && timeRange && (
                          <span className="text-[11px] text-muted-foreground">
                            {timeRange}
                          </span>
                        )}

                        {/* Room */}
                        {session.room && (
                          <span className="text-[11px] text-muted-foreground">
                            {session.room}
                          </span>
                        )}

                        {/* Speakers */}
                        {session.speakers.length > 0 && (
                          <div className="mt-0.5 flex flex-col gap-1">
                            {session.speakers.map((s) => (
                              <SpeakerChip key={s.speaker.id} entry={s} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bookmark button */}
                      {!readOnly && (
                        <div className="shrink-0">
                          <AgendaToggleButton
                            slug={slug}
                            sessionId={session.id}
                            initialInAgenda={
                              agendaSessionIds?.has(session.id) ?? false
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
