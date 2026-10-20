"use client";

import { useActionState, useState } from "react";
import { createEvent, type CreateEventState } from "./actions";
import { slugify } from "@/lib/slug";
import { EventAddressField } from "@/components/event-address-field";
import { RequiredMark } from "@/components/required-mark";
import Link from "next/link";
import { TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { EVENT_TYPE_OPTIONS, NO_EVENT_TYPE_VALUE } from "@/lib/event-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const initialState: CreateEventState = { status: "idle" };

export function NewEventForm() {
  const [state, formAction, isPending] = useActionState(
    createEvent,
    initialState,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [eventType, setEventType] = useState(NO_EVENT_TYPE_VALUE);
  const [roomNamesText, setRoomNamesText] = useState("");
  const [interestOptionsText, setInterestOptionsText] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  // Wartość już uporządkowana przez pole adresu (sanitizeSlugInput / slugify przy opuszczeniu pola).
  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value);
  }

  const fieldError = (field: NonNullable<CreateEventState["field"]>) =>
    state.status === "error" && state.field === field ? (state.message ?? null) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Nowy event</CardTitle>
          <CardDescription className="flex flex-col gap-1">
            <span>
              Wystarczą nazwa, adres strony oraz data i godzina początku i końca — strefę czasową
              ustawiliśmy za Ciebie. Event powstanie jako szkic, a opublikujesz go, kiedy będzie gotowy.
            </span>
            <span className="text-xs">
              Pola oznaczone <span className="text-destructive">*</span> są wymagane.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">
                Nazwa eventu
                <RequiredMark />
              </Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Konferencja Tech 2026"
                required
                aria-invalid={fieldError("name") ? true : undefined}
              />
              <FieldError message={fieldError("name")} />
            </div>
            <EventAddressField value={slug} onChange={handleSlugChange} requiredMark error={fieldError("slug")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="starts_at">
                  Początek
                  <RequiredMark />
                </Label>
                <DateTimePicker
                  id="starts_at"
                  name="starts_at"
                  value={startsAt}
                  onChange={setStartsAt}
                />
                <FieldError message={fieldError("starts_at")} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="ends_at">
                  Koniec
                  <RequiredMark />
                </Label>
                <DateTimePicker
                  id="ends_at"
                  name="ends_at"
                  value={endsAt}
                  onChange={setEndsAt}
                />
                <FieldError message={fieldError("ends_at")} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">
                Strefa czasowa
                <RequiredMark />
              </Label>
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
              <Input id="location" name="location" placeholder="Warszawa" />
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
            {/* Błąd bez przypisanego pola (np. limit planu) — przy przyciskach. */}
            {state.status === "error" && !state.field && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            {/* Telefon: przycisk główny na górze, „Anuluj” pod nim (oba pełnej szerokości). */}
            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
              <Button type="submit" disabled={isPending} className="min-h-11 sm:min-h-9">
                {isPending ? "Tworzenie..." : "Utwórz event"}
              </Button>
              <Button asChild variant="outline" className="min-h-11 sm:min-h-9">
                <Link href="/admin">Anuluj</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
