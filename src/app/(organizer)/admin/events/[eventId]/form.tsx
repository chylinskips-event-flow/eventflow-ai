"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { toast } from "sonner";
import {
  updateEvent,
  publishEvent,
  startEvent,
  completeEvent,
  uploadEventLogo,
  unpublishEvent,
  softDeleteEvent,
  type EventFormState,
  type EventDangerState,
} from "./actions";
import type { Event } from "@/lib/events";
import { toDateTimeLocalValue } from "@/lib/format";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { EVENT_TYPE_OPTIONS, NO_EVENT_TYPE_VALUE } from "@/lib/event-options";
import { slugify } from "@/lib/slug";
import { BadgeBgUpload } from "./badges/badge-bg-upload";
import { TIMEZONES } from "@/lib/timezones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SettingsBar, SettingsNav, type SettingsSectionId } from "./settings-nav";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STATUS_LABELS: Record<Event["status"], string> = {
  draft: "Szkic",
  published: "Opublikowany",
  live: "Na żywo",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};

const initialState: EventFormState = { status: "idle" };

const GENERAL_FORM_ID = "event-general-form";

export function EventEditForm({
  event,
  attendeeCount,
  paidOrderCount,
  subdomainStatus,
  summary,
}: {
  event: Event;
  attendeeCount: number;
  paidOrderCount: number;
  subdomainStatus?: React.ReactNode;
  summary?: React.ReactNode;
}) {
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
  const [logoClientError, setLogoClientError] = useState<string | null>(null);
  // Formularz „Ogólne" ma dwa przyciski zapisu (Ogólne + kolor w Branding) — komunikat pokazujemy przy tym, który kliknięto.
  const [lastSubmit, setLastSubmit] = useState<"general" | "branding">("general");

  function handleLogoSubmit(event: React.FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem(
      "logo",
    ) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    const error = validateImageFile(file, 5 * MB);
    if (error) {
      event.preventDefault();
      setLogoClientError(error);
    } else {
      setLogoClientError(null);
    }
  }

  const [name, setName] = useState(event.name);
  const [slug, setSlug] = useState(event.slug);
  const [slugTouched, setSlugTouched] = useState(true);
  const [timezone, setTimezone] = useState(event.timezone ?? "Europe/Warsaw");
  const [startsAt, setStartsAt] = useState(
    toDateTimeLocalValue(event.starts_at, event.timezone),
  );
  const [endsAt, setEndsAt] = useState(
    toDateTimeLocalValue(event.ends_at, event.timezone),
  );
  const [eventType, setEventType] = useState(
    event.event_type ?? NO_EVENT_TYPE_VALUE,
  );
  const [roomNamesText, setRoomNamesText] = useState(
    (event.room_names ?? []).join("\n"),
  );
  const [interestOptionsText, setInterestOptionsText] = useState(
    (event.interest_options ?? []).join("\n"),
  );
  const [requiresApproval, setRequiresApproval] = useState(
    event.requires_approval,
  );
  const [gamificationEnabled, setGamificationEnabled] = useState(
    event.gamification_enabled,
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
        toast.success("Wydarzenie opublikowane", {
          action: {
            label: "Zobacz stronę",
            onClick: () => window.open(`/e/${event.slug}?preview=1`, "_blank"),
          },
        });
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
        toast.success("Wydarzenie rozpoczęte – uczestnicy widzą sekcję na żywo", {
          action: {
            label: "Zobacz stronę",
            onClick: () => window.open(`/e/${event.slug}?preview=1`, "_blank"),
          },
        });
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
        toast.success("Wydarzenie zakończone");
      } catch (err) {
        setCompleteError(
          err instanceof Error
            ? err.message
            : "Nie udało się zakończyć wydarzenia.",
        );
      }
    });
  }

  const [isUnpublishOpen, setIsUnpublishOpen] = useState(false);
  const [isUnpublishing, startUnpublishTransition] = useTransition();
  const [unpublishError, setUnpublishError] = useState<string | null>(null);

  function handleUnpublish() {
    setUnpublishError(null);
    startUnpublishTransition(async () => {
      const result = await unpublishEvent(event.id);
      if (result.status === "error") {
        setUnpublishError(result.message ?? "Nie udało się cofnąć publikacji.");
        return;
      }
      setIsUnpublishOpen(false);
      toast.success("Publikacja cofnięta — wydarzenie jest teraz szkicem.");
    });
  }

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteState, setDeleteState] = useState<EventDangerState>({ status: "idle" });

  function handleDelete() {
    setDeleteState({ status: "idle" });
    startDeleteTransition(async () => {
      const result = await softDeleteEvent(event.id, deleteConfirmName);
      if (result.status === "error") {
        setDeleteState(result);
        return;
      }
      // softDeleteEvent redirects on success — nothing to do here.
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
    <main className="mx-auto w-full max-w-2xl p-6 xl:grid xl:max-w-none xl:grid-cols-[11rem_minmax(0,42rem)] xl:justify-center xl:gap-10">
      <SettingsNav className="hidden xl:block" />

      <div className="flex min-w-0 flex-col gap-6">
        <SettingsBar className="xl:hidden" />

        {summary}

        <SettingsSection
          id="ogolne"
          title="Ogólne"
          description="Podstawowe informacje o wydarzeniu, status publikacji i adres strony."
        >
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Status:</span>{" "}
                <span className="font-medium">{STATUS_LABELS[event.status]}</span>
              </p>
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
                        Event stanie się widoczny publicznie. Możesz cofnąć
                        publikację w dowolnym momencie z tego panelu.
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
              ) : null}
            </div>
            {subdomainStatus}
          </div>

          <form
            id={GENERAL_FORM_ID}
            action={formAction}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nazwa wydarzenia</Label>
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
                <DateTimePicker
                  id="starts_at"
                  name="starts_at"
                  value={startsAt}
                  onChange={setStartsAt}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ends_at">Koniec</Label>
                <DateTimePicker
                  id="ends_at"
                  name="ends_at"
                  value={endsAt}
                  onChange={setEndsAt}
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
              <Label htmlFor="event_type">Typ wydarzenia (opcjonalnie)</Label>
              <input
                type="hidden"
                name="event_type"
                value={eventType === NO_EVENT_TYPE_VALUE ? "" : eventType}
              />
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="event_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EVENT_TYPE_VALUE}>Nie wybrano</SelectItem>
                  {EVENT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                Jedna nazwa sali w linii – przyda się przy planowaniu agendy.
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
            <div className="flex flex-col gap-4 border-t pt-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gamification_enabled"
                  name="gamification_enabled"
                  checked={gamificationEnabled}
                  onCheckedChange={(checked) =>
                    setGamificationEnabled(checked === true)
                  }
                  className="mt-1"
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="gamification_enabled" className="font-normal">
                    Grywalizacja włączona
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Zadania przy stoiskach, punkty i loteria. Gdy wyłączona,
                    uczestnicy nie widzą żadnych elementów grywalizacji.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lottery_points_per_ticket">
                  Punkty na 1 los loterii (opcjonalnie)
                </Label>
                <Input
                  id="lottery_points_per_ticket"
                  name="lottery_points_per_ticket"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={event.lottery_points_per_ticket ?? ""}
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Ile punktów odpowiada jednemu losowi. Pozostaw puste, aby
                  wyłączyć loterię.
                </p>
              </div>
            </div>
            {lastSubmit === "general" && <FormStateMessage state={state} />}
            <Button
              type="submit"
              disabled={isPending}
              onClick={() => setLastSubmit("general")}
            >
              {isPending && lastSubmit === "general"
                ? "Zapisywanie..."
                : "Zapisz zmiany"}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          id="branding"
          title="Branding"
          description="Logo i kolor akcentu widoczne na stronie wydarzenia i identyfikatorach."
        >
          <form
            action={logoFormAction}
            onSubmit={handleLogoSubmit}
            className="flex flex-col gap-4"
            encType="multipart/form-data"
          >
            <h3 className="text-sm font-semibold">Logo wydarzenia</h3>
            {event.logo_url && (
              <img
                src={event.logo_url}
                alt={`Logo ${event.name}`}
                className="h-16 w-fit max-w-full rounded border object-contain"
              />
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="logo">Plik logo</Label>
              <FileInput
                id="logo"
                name="logo"
                accept="image/jpeg,image/png,image/webp"
              />
            </div>
            {logoClientError && (
              <p className="text-sm text-destructive">{logoClientError}</p>
            )}
            <FormStateMessage state={logoState} />
            <Button type="submit" disabled={isLogoPending} variant="outline">
              {isLogoPending ? "Wgrywanie..." : "Wgraj logo"}
            </Button>
          </form>

          {/* Pole koloru należy do formularza „Ogólne" (atrybut form) — zapis tą samą akcją co dotąd. */}
          <div className="flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="primary_color">Kolor akcentu</Label>
              <Input
                id="primary_color"
                name="primary_color"
                form={GENERAL_FORM_ID}
                type="color"
                defaultValue={event.primary_color ?? "#000000"}
                className="h-10 w-20 p-1"
              />
              <p className="text-xs text-muted-foreground">
                Zapis koloru zapisuje też niezapisane zmiany z sekcji Ogólne.
              </p>
            </div>
            {lastSubmit === "branding" && <FormStateMessage state={state} />}
            <Button
              type="submit"
              form={GENERAL_FORM_ID}
              variant="outline"
              disabled={isPending}
              onClick={() => setLastSubmit("branding")}
            >
              {isPending && lastSubmit === "branding"
                ? "Zapisywanie..."
                : "Zapisz kolor"}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          id="identyfikatory"
          title="Identyfikatory"
          description="Wygląd identyfikatorów PDF drukowanych dla uczestników."
        >
          <BadgeBgUpload eventId={event.id} badgeBgUrl={event.badge_bg_url ?? null} />
          <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Generowanie identyfikatorów (PDF) znajdziesz w zakładce{" "}
              <Link
                href={`/admin/events/${event.id}/attendees`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Uczestnicy
              </Link>
              .
            </span>
          </p>
        </SettingsSection>

        <SettingsSection
          id="strefa-niebezpieczna"
          title="Strefa niebezpieczna"
          description="Operacje wpływające na dostępność lub istnienie wydarzenia. Działaj ostrożnie."
          danger
        >
          {(event.status === "published" || event.status === "live") && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
              <div>
                <p className="font-medium text-sm">Cofnij publikację</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ukryje stronę publiczną i zdejmie subdomenę. Dane zostaną.
                </p>
              </div>
              <AlertDialog
                open={isUnpublishOpen}
                onOpenChange={(open) => {
                  if (isUnpublishing) return;
                  setIsUnpublishOpen(open);
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Cofnij publikację</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cofnąć publikację?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {attendeeCount > 0
                        ? `Ten event ma ${attendeeCount} zarejestrowanych uczestnik${attendeeCount === 1 ? "a" : "ów"}. `
                        : ""}
                      Cofnięcie publikacji ukryje stronę publiczną i zdejmie
                      subdomenę. Dane zostaną — możesz ponownie opublikować
                      wydarzenie później.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {unpublishError && (
                    <p className="text-sm text-destructive">{unpublishError}</p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isUnpublishing}>
                      Anuluj
                    </AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={handleUnpublish}
                      disabled={isUnpublishing}
                    >
                      {isUnpublishing ? "Cofanie..." : "Cofnij publikację"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Usuń wydarzenie</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {paidOrderCount > 0
                  ? `Zablokowane — event ma ${paidOrderCount} opłacone zamówienie(a).`
                  : attendeeCount > 0
                  ? `Trwale usunie dane ${attendeeCount} uczestnik${attendeeCount === 1 ? "a" : "ów"} i wszystkie powiązane rekordy.`
                  : "Trwale usunie to wydarzenie i wszystkie powiązane dane."}
              </p>
            </div>
            <Dialog
              open={isDeleteOpen}
              onOpenChange={(open) => {
                if (isDeleting) return;
                if (!open) setDeleteConfirmName("");
                setDeleteState({ status: "idle" });
                setIsDeleteOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={paidOrderCount > 0}
                  title={
                    paidOrderCount > 0
                      ? "Nie można usunąć eventu z opłaconymi zamówieniami"
                      : undefined
                  }
                >
                  Usuń wydarzenie
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Usunąć wydarzenie?</DialogTitle>
                  <DialogDescription>
                    To działanie jest nieodwracalne. Wydarzenie zniknie z listy
                    i strona publiczna przestanie być dostępna.
                    {attendeeCount > 0 && (
                      <> Usunie dane {attendeeCount} uczestnik{attendeeCount === 1 ? "a" : "ów"}, ich bilety, punkty i wszystkie powiązane rekordy.</>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2 py-2">
                  <Label htmlFor="delete-confirm">
                    Wpisz dokładną nazwę wydarzenia, aby potwierdzić:
                    <span className="ml-1 font-semibold">{event.name}</span>
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={event.name}
                    autoComplete="off"
                  />
                </div>
                {deleteState.status === "error" && (
                  <p className="text-sm text-destructive">{deleteState.message}</p>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteOpen(false)}
                    disabled={isDeleting}
                  >
                    Anuluj
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting || deleteConfirmName.trim() !== event.name}
                  >
                    {isDeleting ? "Usuwanie..." : "Usuń trwale"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </SettingsSection>
      </div>
    </main>
  );
}

function SettingsSection({
  id,
  title,
  description,
  danger = false,
  children,
}: {
  id: SettingsSectionId;
  title: string;
  description: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-24", danger && "mt-6")}
    >
      <Card className={danger ? "border-destructive/40" : undefined}>
        <CardHeader className="border-b">
          <h2
            id={`${id}-title`}
            className={cn(
              "text-lg font-semibold leading-tight",
              danger && "text-destructive",
            )}
          >
            {title}
          </h2>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">{children}</CardContent>
      </Card>
    </section>
  );
}

function FormStateMessage({ state }: { state: EventFormState }) {
  if (state.status === "error") {
    return <p className="text-sm text-destructive">{state.message}</p>;
  }
  if (state.status === "success") {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }
  return null;
}
