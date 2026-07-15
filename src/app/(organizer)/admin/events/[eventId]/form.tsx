"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateEvent,
  publishEvent,
  startEvent,
  completeEvent,
  uploadEventLogo,
  type EventFormState,
} from "./actions";
import type { Event } from "@/lib/events";
import { slugify } from "@/lib/slug";
import { TIMEZONES } from "@/lib/timezones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const STATUS_LABELS: Record<Event["status"], string> = {
  draft: "Szkic",
  published: "Opublikowany",
  live: "Na żywo",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const initialState: EventFormState = { status: "idle" };

export function EventEditForm({ event }: { event: Event }) {
  const updateEventForEvent = updateEvent.bind(null, event.id);
  const uploadLogoForEvent = uploadEventLogo.bind(null, event.id);

  const [state, formAction, isPending] = useActionState(
    updateEventForEvent,
    initialState,
  );
  const [logoState, logoFormAction, isLogoPending] = useActionState(
    uploadLogoForEvent,
    initialState,
  );

  const [name, setName] = useState(event.name);
  const [slug, setSlug] = useState(event.slug);
  const [slugTouched, setSlugTouched] = useState(true);
  const [timezone, setTimezone] = useState(event.timezone ?? "Europe/Warsaw");
  const [roomNamesText, setRoomNamesText] = useState(
    (event.room_names ?? []).join("\n"),
  );
  const [interestOptionsText, setInterestOptionsText] = useState(
    (event.interest_options ?? []).join("\n"),
  );
  const [requiresApproval, setRequiresApproval] = useState(
    event.requires_approval,
  );

  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, startPublishTransition] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);

  function handlePublish() {
    setPublishError(null);
    startPublishTransition(async () => {
      try {
        await publishEvent(event.id);
        setIsPublishOpen(false);
      } catch (err) {
        setPublishError(
          err instanceof Error
            ? err.message
            : "Nie udało się opublikować eventu.",
        );
      }
    });
  }

  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isStarting, startStartTransition] = useTransition();
  const [startError, setStartError] = useState<string | null>(null);

  function handleStart() {
    setStartError(null);
    startStartTransition(async () => {
      try {
        await startEvent(event.id);
        setIsStartOpen(false);
      } catch (err) {
        setStartError(
          err instanceof Error
            ? err.message
            : "Nie udało się rozpocząć wydarzenia.",
        );
      }
    });
  }

  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isCompleting, startCompleteTransition] = useTransition();
  const [completeError, setCompleteError] = useState<string | null>(null);

  function handleComplete() {
    setCompleteError(null);
    startCompleteTransition(async () => {
      try {
        await completeEvent(event.id);
        setIsCompleteOpen(false);
      } catch (err) {
        setCompleteError(
          err instanceof Error
            ? err.message
            : "Nie udało się zakończyć wydarzenia.",
        );
      }
    });
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(slugify(value));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        {event.status === "draft" ? (
          <AlertDialog
            open={isPublishOpen}
            onOpenChange={(open) => {
              if (isPublishing) return;
              setIsPublishOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button>Opublikuj event</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Opublikować event?</AlertDialogTitle>
                <AlertDialogDescription>
                  Event stanie się widoczny publicznie. Tej operacji nie da
                  się jeszcze wycofać z panelu.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {publishError && (
                <p className="text-sm text-destructive">{publishError}</p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPublishing}>
                  Anuluj
                </AlertDialogCancel>
                <Button onClick={handlePublish} disabled={isPublishing}>
                  {isPublishing ? "Publikowanie..." : "Opublikuj"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : event.status === "published" ? (
          <AlertDialog
            open={isStartOpen}
            onOpenChange={(open) => {
              if (isStarting) return;
              setIsStartOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button>Rozpocznij wydarzenie</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rozpocząć wydarzenie?</AlertDialogTitle>
                <AlertDialogDescription>
                  Czy na pewno chcesz rozpocząć wydarzenie? Uczestnicy zobaczą
                  sekcję na żywo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {startError && (
                <p className="text-sm text-destructive">{startError}</p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isStarting}>
                  Anuluj
                </AlertDialogCancel>
                <Button onClick={handleStart} disabled={isStarting}>
                  {isStarting ? "Rozpoczynanie..." : "Rozpocznij"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : event.status === "live" ? (
          <AlertDialog
            open={isCompleteOpen}
            onOpenChange={(open) => {
              if (isCompleting) return;
              setIsCompleteOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button>Zakończ wydarzenie</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zakończyć wydarzenie?</AlertDialogTitle>
                <AlertDialogDescription>
                  Czy na pewno chcesz zakończyć wydarzenie? Sekcja na żywo
                  zniknie, uczestnicy zachowają dostęp do swoich danych.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {completeError && (
                <p className="text-sm text-destructive">{completeError}</p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isCompleting}>
                  Anuluj
                </AlertDialogCancel>
                <Button onClick={handleComplete} disabled={isCompleting}>
                  {isCompleting ? "Kończenie..." : "Zakończ"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Badge variant="secondary">{STATUS_LABELS[event.status]}</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Szczegóły eventu</CardTitle>
          <CardDescription>
            Status: {STATUS_LABELS[event.status]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nazwa eventu</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Adres (slug)</Label>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="starts_at">Początek</Label>
                <Input
                  id="starts_at"
                  name="starts_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(event.starts_at)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ends_at">Koniec</Label>
                <Input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(event.ends_at)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">Strefa czasowa</Label>
              <input type="hidden" name="timezone" value={timezone} />
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="location">Lokalizacja (opcjonalnie)</Label>
              <Input
                id="location"
                name="location"
                defaultValue={event.location ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="room_names">Sale (opcjonalnie)</Label>
              <Textarea
                id="room_names"
                name="room_names"
                value={roomNamesText}
                onChange={(e) => setRoomNamesText(e.target.value)}
                placeholder={"Sala A\nSala B\nSala konferencyjna"}
              />
              <p className="text-xs text-muted-foreground">
                Jedna nazwa sali w linii — przyda się przy planowaniu agendy.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="interest_options">
                Zainteresowania uczestników (opcjonalnie)
              </Label>
              <Textarea
                id="interest_options"
                name="interest_options"
                value={interestOptionsText}
                onChange={(e) => setInterestOptionsText(e.target.value)}
                placeholder={"AI\nSaaS\nMarketing"}
              />
              <p className="text-xs text-muted-foreground">
                Lista zainteresowań, które uczestnicy mogą wybrać przy
                rejestracji. Pozostaw pustą, aby użyć domyślnej listy.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="requires_approval"
                name="requires_approval"
                checked={requiresApproval}
                onCheckedChange={(checked) => setRequiresApproval(checked === true)}
                className="mt-1"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="requires_approval" className="font-normal">
                  Wymagaj zatwierdzenia rejestracji
                </Label>
                <p className="text-xs text-muted-foreground">
                  Każda rejestracja będzie wymagać Twojej akceptacji, zanim
                  uczestnik otrzyma dostęp i QR kod. Przydatne np. dla eventów
                  z ograniczeniem dostępu dla konkurencji.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="primary_color">Kolor podstawowy</Label>
              <Input
                id="primary_color"
                name="primary_color"
                type="color"
                defaultValue={event.primary_color ?? "#000000"}
                className="h-10 w-20 p-1"
              />
            </div>
            {state.status === "error" && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            {state.status === "success" && (
              <p className="text-sm text-muted-foreground">
                {state.message}
              </p>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Zapisywanie..." : "Zapisz zmiany"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo eventu</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={logoFormAction}
            className="flex flex-col gap-4"
            encType="multipart/form-data"
          >
            {event.logo_url && (
              <img
                src={event.logo_url}
                alt={`Logo ${event.name}`}
                className="h-16 w-auto rounded border object-contain"
              />
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="logo">Plik logo</Label>
              <Input
                id="logo"
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </div>
            {logoState.status === "error" && (
              <p className="text-sm text-destructive">{logoState.message}</p>
            )}
            {logoState.status === "success" && (
              <p className="text-sm text-muted-foreground">
                {logoState.message}
              </p>
            )}
            <Button type="submit" disabled={isLogoPending} variant="outline">
              {isLogoPending ? "Wgrywanie..." : "Wgraj logo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
