"use client";

import { useState, useTransition } from "react";
import { deleteSession } from "./actions";
import type { Session } from "@/lib/sessions";
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

const dayFormatter = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFormatter = new Intl.DateTimeFormat("pl-PL", { timeStyle: "short" });

function speakerName(speaker: Speaker | undefined) {
  if (!speaker) return "Brak prelegenta";
  return [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") || "Brak prelegenta";
}

function SessionRow({
  eventId,
  session,
  speakers,
  existingSessions,
  eventStartsAt,
  eventEndsAt,
  speaker,
}: {
  eventId: string;
  session: Session;
  speakers: Speaker[];
  existingSessions: Session[];
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  speaker?: Speaker;
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
          {session.starts_at && <span>{timeFormatter.format(new Date(session.starts_at))}</span>}
          {session.room && <span>{session.room}</span>}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">{session.title}</span>
          <span className="text-sm text-muted-foreground">
            {speakerName(speaker)}
          </span>
        </div>
        <SessionFormDialog
          eventId={eventId}
          session={session}
          speakers={speakers}
          existingSessions={existingSessions}
          eventStartsAt={eventStartsAt}
          eventEndsAt={eventEndsAt}
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
  eventStartsAt,
  eventEndsAt,
}: {
  eventId: string;
  sessions: Session[];
  speakers: Speaker[];
  eventStartsAt: string | null;
  eventEndsAt: string | null;
}) {
  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));

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
          <h2 className="text-sm font-medium text-muted-foreground">
            {key === "no-date"
              ? "Bez ustalonej daty"
              : dayFormatter.format(new Date(group[0].starts_at!))}
          </h2>
          {group.map((session) => (
            <SessionRow
              key={session.id}
              eventId={eventId}
              session={session}
              speakers={speakers}
              existingSessions={sessions}
              eventStartsAt={eventStartsAt}
              eventEndsAt={eventEndsAt}
              speaker={session.speaker_id ? speakerMap.get(session.speaker_id) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
