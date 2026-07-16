"use client";

import { useState, useTransition } from "react";
import { deleteSession } from "./actions";
import type { Session } from "@/lib/sessions";
import {
  formatDay,
  formatSessionSpeakers,
  formatTimeRange,
  getDateGroupKey,
} from "@/lib/format";
import type { Speaker } from "@/lib/speakers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SessionFormDialog } from "./session-form-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function SessionRow({
  eventId,
  session,
  speakers,
  existingSessions,
  roomNames,
  timezone,
}: {
  eventId: string;
  session: Session;
  speakers: Speaker[];
  existingSessions: Session[];
  roomNames: string[];
  timezone: string | null;
}) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteSession(eventId, session.id);
      if (result.status === "error") {
        setDeleteError(result.message ?? "Nie udało się usunąć sesji.");
        return;
      }
      setIsDeleteOpen(false);
    });
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-3">
        <div className="flex w-28 flex-col text-sm text-muted-foreground">
          {formatTimeRange(session.starts_at, session.ends_at, timezone) && (
            <span>{formatTimeRange(session.starts_at, session.ends_at, timezone)}</span>
          )}
          {session.room && <span>{session.room}</span>}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">{session.title}</span>
          <span className="text-sm text-muted-foreground">
            {formatSessionSpeakers(session.speakers) ?? "Brak prelegenta"}
          </span>
        </div>
        <SessionFormDialog
          eventId={eventId}
          eventTimezone={timezone}
          session={session}
          speakers={speakers}
          existingSessions={existingSessions}
          roomNames={roomNames}
          trigger={<Button variant="outline" size="sm">Edytuj</Button>}
        />
        <AlertDialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            if (isDeleting) return;
            setIsDeleteOpen(open);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              Usuń
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usunąć sesję?</AlertDialogTitle>
              <AlertDialogDescription>
                Usunięcie sesji „{session.title}” jest nieodwracalne.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Usuwanie..." : "Usuń"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export function SessionList({
  eventId,
  sessions,
  speakers,
  roomNames,
  timezone,
}: {
  eventId: string;
  sessions: Session[];
  speakers: Speaker[];
  roomNames: string[];
  timezone: string | null;
}) {
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
          <h2 className="text-sm font-medium text-muted-foreground">
            {key === "no-date"
              ? "Bez ustalonej daty"
              : formatDay(group[0].starts_at, timezone)}
          </h2>
          {group.map((session) => (
            <SessionRow
              key={session.id}
              eventId={eventId}
              session={session}
              speakers={speakers}
              existingSessions={sessions}
              roomNames={roomNames}
              timezone={timezone}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
