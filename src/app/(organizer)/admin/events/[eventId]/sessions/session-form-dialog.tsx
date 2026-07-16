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
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
const NO_MODERATOR_VALUE = "__none__";
const NO_ROOM_VALUE = "__no_room__";

function speakerFullName(speaker: Speaker) {
  return (
    [speaker.first_name, speaker.last_name].filter(Boolean).join(" ") ||
    "Bez nazwy"
  );
}
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DEFAULT_DURATION = 45;
const CUSTOM_DURATION_VALUE = "__custom__";
const MIN_DURATION = 5;
const MAX_DURATION = 720; // 12h

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
  // Czas trwania: Select ze standardowymi opcjami + "Inny...". Wartość
  // niestandardowa (np. 75 z edycji) otwiera od razu tryb "Inny..." z
  // wypełnionym inputem — jedna ścieżka dla wszystkich wartości spoza listy.
  const currentDuration = initialDuration(session);
  const isInitialCustom = !DURATION_OPTIONS.includes(currentDuration);
  const [durationSelect, setDurationSelect] = useState(
    isInitialCustom ? CUSTOM_DURATION_VALUE : String(currentDuration),
  );
  const [customDuration, setCustomDuration] = useState(
    isInitialCustom ? String(currentDuration) : "",
  );
  const durationValue =
    durationSelect === CUSTOM_DURATION_VALUE ? customDuration : durationSelect;
  // Kolejność w tablicy = position (kolejność klikania chipów).
  const [speakerIds, setSpeakerIds] = useState<string[]>(
    () => session?.speakers.map((entry) => entry.speaker.id) ?? [],
  );
  const [moderatorId, setModeratorId] = useState<string>(
    () =>
      session?.speakers.find((entry) => entry.role === "moderator")?.speaker
        .id ?? NO_MODERATOR_VALUE,
  );

  function toggleSpeaker(id: string) {
    setSpeakerIds((prev) => {
      if (prev.includes(id)) {
        // Odznaczenie moderatora resetuje wybór moderatora.
        if (id === moderatorId) setModeratorId(NO_MODERATOR_VALUE);
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  }

  // "Koniec: HH:MM" na żywo (tylko do wyświetlenia; serwer liczy ends_at sam).
  const endLabel = useMemo(() => {
    if (!startsAt) return null;
    const startEpoch = new Date(
      parseDateTimeLocal(startsAt, eventTimezone),
    ).getTime();
    const dur = Number(durationValue);
    if (Number.isNaN(startEpoch) || !Number.isFinite(dur) || dur <= 0) {
      return null;
    }
    return formatTime(
      new Date(startEpoch + dur * 60000).toISOString(),
      eventTimezone,
    );
  }, [startsAt, durationValue, eventTimezone]);

  const collisionWarning = useMemo(() => {
    if (!room || room === NO_ROOM_VALUE || !startsAt) return null;
    // Naiwny start -> instant w strefie eventu; koniec = start + duration
    // (arytmetyka epoch), żeby porównanie z sesjami z bazy (ISO) było w tej
    // samej osi czasu.
    const start = new Date(parseDateTimeLocal(startsAt, eventTimezone)).getTime();
    const dur = Number(durationValue);
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
  }, [room, startsAt, durationValue, existingSessions, session, eventTimezone]);

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
              <DateTimePicker
                id="starts_at"
                name="starts_at"
                value={startsAt}
                onChange={setStartsAt}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration_select">Czas trwania</Label>
              <input type="hidden" name="duration_minutes" value={durationValue} />
              <Select value={durationSelect} onValueChange={setDurationSelect}>
                <SelectTrigger id="duration_select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((min) => (
                    <SelectItem key={min} value={String(min)}>
                      {min} min
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_DURATION_VALUE}>Inny...</SelectItem>
                </SelectContent>
              </Select>
              {durationSelect === CUSTOM_DURATION_VALUE && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="custom_duration" className="text-xs font-normal">
                    Czas trwania (minuty)
                  </Label>
                  <Input
                    id="custom_duration"
                    type="number"
                    min={MIN_DURATION}
                    max={MAX_DURATION}
                    step={5}
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                  />
                </div>
              )}
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
            <Label>Prelegenci (opcjonalnie)</Label>
            <div className="flex flex-wrap gap-2">
              {speakers.map((speaker) => {
                const order = speakerIds.indexOf(speaker.id);
                const selected = order !== -1;
                return (
                  <button
                    key={speaker.id}
                    type="button"
                    onClick={() => toggleSpeaker(speaker.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground",
                    )}
                  >
                    {selected && (
                      <span className="mr-1 text-xs opacity-80">
                        {order + 1}.
                      </span>
                    )}
                    {speakerFullName(speaker)}
                  </button>
                );
              })}
            </div>
            {speakers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nie masz jeszcze prelegentów – dodaj ich w zakładce Prelegenci.
              </p>
            )}
            {speakerIds.map((id) => (
              <input key={id} type="hidden" name="speaker_ids" value={id} />
            ))}
          </div>

          {speakerIds.length >= 2 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="moderator_id">Moderator (opcjonalnie)</Label>
              <input
                type="hidden"
                name="moderator_id"
                value={moderatorId === NO_MODERATOR_VALUE ? "" : moderatorId}
              />
              <Select value={moderatorId} onValueChange={setModeratorId}>
                <SelectTrigger id="moderator_id" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODERATOR_VALUE}>
                    Brak moderatora
                  </SelectItem>
                  {speakerIds.map((id) => {
                    const speaker = speakers.find((item) => item.id === id);
                    if (!speaker) return null;
                    return (
                      <SelectItem key={id} value={id}>
                        {speakerFullName(speaker)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
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
