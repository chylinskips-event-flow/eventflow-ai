"use client";

import { useActionState, useMemo, useState } from "react";
import { createSession, updateSession, type SessionFormState } from "./actions";
import type { Session } from "@/lib/sessions";
import type { Speaker } from "@/lib/speakers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SessionFormState = { status: "idle" };
const NO_SPEAKER_VALUE = "__none__";

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA;
}

export function SessionFormDialog({
  eventId,
  session,
  speakers,
  existingSessions,
  trigger,
}: {
  eventId: string;
  session?: Session;
  speakers: Speaker[];
  existingSessions: Session[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [lastStatus, setLastStatus] = useState<SessionFormState["status"]>("idle");

  const action = session
    ? updateSession.bind(null, eventId, session.id)
    : createSession.bind(null, eventId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  const [title, setTitle] = useState(session?.title ?? "");
  const [description, setDescription] = useState(session?.description ?? "");
  const [track, setTrack] = useState(session?.track ?? "");
  const [room, setRoom] = useState(session?.room ?? "");
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(session?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(session?.ends_at ?? null));
  const [speakerId, setSpeakerId] = useState(session?.speaker_id ?? NO_SPEAKER_VALUE);

  const collisionWarning = useMemo(() => {
    if (!room || !startsAt || !endsAt) return null;
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

    const conflict = existingSessions.find((other) => {
      if (session && other.id === session.id) return false;
      if (!other.room || other.room !== room) return false;
      if (!other.starts_at || !other.ends_at) return false;
      return rangesOverlap(
        start,
        end,
        new Date(other.starts_at).getTime(),
        new Date(other.ends_at).getTime(),
      );
    });

    return conflict
      ? `Ta sala jest zajęta w tym czasie przez sesję „${conflict.title}” — zapis zostanie zablokowany.`
      : null;
  }, [room, startsAt, endsAt, existingSessions, session]);

  if (state.status !== lastStatus) {
    setLastStatus(state.status);
    if (state.status === "success" && !session) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session ? "Edytuj sesję" : "Dodaj sesję"}</DialogTitle>
          <DialogDescription>
            {session
              ? "Zaktualizuj szczegóły sesji."
              : "Dodaj nową sesję do agendy tego eventu."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Tytuł</Label>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Opis (opcjonalnie)</Label>
            <Textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="track">Ścieżka (opcjonalnie)</Label>
              <Input
                id="track"
                name="track"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="room">Sala (opcjonalnie)</Label>
              <Input
                id="room"
                name="room"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="starts_at">Początek</Label>
              <Input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ends_at">Koniec</Label>
              <Input
                id="ends_at"
                name="ends_at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </div>
          </div>
          {collisionWarning && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              {collisionWarning}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="speaker_id">Prelegent</Label>
            <input type="hidden" name="speaker_id" value={speakerId === NO_SPEAKER_VALUE ? "" : speakerId} />
            <Select value={speakerId} onValueChange={setSpeakerId}>
              <SelectTrigger id="speaker_id" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SPEAKER_VALUE}>Brak prelegenta</SelectItem>
                {speakers.map((speaker) => (
                  <SelectItem key={speaker.id} value={speaker.id}>
                    {[speaker.first_name, speaker.last_name].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state.status === "success" && session && (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Zapisywanie..." : session ? "Zapisz zmiany" : "Dodaj sesję"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
