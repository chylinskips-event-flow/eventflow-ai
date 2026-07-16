"use client";

import { useActionState, useMemo, useState } from "react";
import { createSession, updateSession, type SessionFormState } from "./actions";
import type { Session } from "@/lib/sessions";
import type { Speaker } from "@/lib/speakers";
import {
  formatTime,
  parseDateTimeLocal,
  toDateTimeLocalValue,
} from "@/lib/format";
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
const NO_ROOM_VALUE = "__no_room__";
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DEFAULT_DURATION = 45;

// Koniec chronologicznie ostatniej sesji (max ends_at) — domyślny start nowej.
function lastSessionEndIso(sessions: Session[]): string | null {
  let maxTime = -Infinity;
  for (const s of sessions) {
    if (!s.ends_at) continue;
    const t = new Date(s.ends_at).getTime();
    if (t > maxTime) maxTime = t;
  }
  return Number.isFinite(maxTime) ? new Date(maxTime).toISOString() : null;
}

// Czas trwania (min) z istniejącej sesji; 45 gdy brak danych.
function initialDuration(session?: Session): number {
  if (session?.starts_at && session?.ends_at) {
    const mins = Math.round(
      (new Date(session.ends_at).getTime() -
        new Date(session.starts_at).getTime()) /
        60000,
    );
    return mins > 0 ? mins : DEFAULT_DURATION;
  }
  return DEFAULT_DURATION;
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
  eventTimezone,
  eventStartsAt,
  session,
  speakers,
  existingSessions,
  roomNames,
  trigger,
}: {
  eventId: string;
  eventTimezone: string | null;
  eventStartsAt?: string | null;
  session?: Session;
  speakers: Speaker[];
  existingSessions: Session[];
  roomNames: string[];
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
  const [room, setRoom] = useState(session?.room ?? NO_ROOM_VALUE);
  // Nowa sesja: start = koniec ostatniej sesji, inaczej start eventu.
  const [startsAt, setStartsAt] = useState(() =>
    session
      ? toDateTimeLocalValue(session.starts_at ?? null, eventTimezone)
      : toDateTimeLocalValue(
          lastSessionEndIso(existingSessions) ?? eventStartsAt ?? null,
          eventTimezone,
        ),
  );
  // Czas trwania (min) jako wartość Selecta (string). Niestandardowy z edycji
  // (np. 75) dostaje osobną opcję "(obecny)", żeby nie zniknął ani nie został
  // zaokrąglony.
  const currentDuration = initialDuration(session);
  const hasCustomDuration = !DURATION_OPTIONS.includes(currentDuration);
  const [duration, setDuration] = useState(String(currentDuration));
  const [speakerId, setSpeakerId] = useState(session?.speaker_id ?? NO_SPEAKER_VALUE);

  // "Koniec: HH:MM" na żywo (tylko do wyświetlenia; serwer liczy ends_at sam).
  const endLabel = useMemo(() => {
    if (!startsAt) return null;
    const startEpoch = new Date(
      parseDateTimeLocal(startsAt, eventTimezone),
    ).getTime();
    const dur = Number(duration);
    if (Number.isNaN(startEpoch) || !Number.isFinite(dur) || dur <= 0) {
      return null;
    }
    return formatTime(
      new Date(startEpoch + dur * 60000).toISOString(),
      eventTimezone,
    );
  }, [startsAt, duration, eventTimezone]);

  const collisionWarning = useMemo(() => {
    if (!room || room === NO_ROOM_VALUE || !startsAt) return null;
    // Naiwny start -> instant w strefie eventu; koniec = start + duration
    // (arytmetyka epoch), żeby porównanie z sesjami z bazy (ISO) było w tej
    // samej osi czasu.
    const start = new Date(parseDateTimeLocal(startsAt, eventTimezone)).getTime();
    const dur = Number(duration);
    if (Number.isNaN(start) || !Number.isFinite(dur) || dur <= 0) return null;
    const end = start + dur * 60000;

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
      ? `Ta sala jest zajęta w tym czasie przez sesję „${conflict.title}” – zapis zostanie zablokowany.`
      : null;
  }, [room, startsAt, duration, existingSessions, session, eventTimezone]);

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
              <input
                type="hidden"
                name="room"
                value={room === NO_ROOM_VALUE ? "" : room}
              />
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger id="room" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROOM_VALUE}>Brak sali</SelectItem>
                  {roomNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roomNames.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nie masz jeszcze zdefiniowanych sal – dodaj je w Ustawieniach
                  eventu.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="starts_at">Początek</Label>
              <Input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                step={300}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration_minutes">Czas trwania</Label>
              <input type="hidden" name="duration_minutes" value={duration} />
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="duration_minutes" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((min) => (
                    <SelectItem key={min} value={String(min)}>
                      {min} min
                    </SelectItem>
                  ))}
                  {hasCustomDuration && (
                    <SelectItem value={String(currentDuration)}>
                      {currentDuration} min (obecny)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {endLabel && (
                <p className="text-xs text-muted-foreground">
                  Koniec: {endLabel}
                </p>
              )}
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
