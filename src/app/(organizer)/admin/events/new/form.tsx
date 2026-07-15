"use client";

import { useActionState, useState } from "react";
import { createEvent, type CreateEventState } from "./actions";
import { slugify } from "@/lib/slug";
import { TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [roomNamesText, setRoomNamesText] = useState("");
  const [interestOptionsText, setInterestOptionsText] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);

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
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Nowy event</CardTitle>
          <CardDescription>
            Event zostanie utworzony jako szkic — opublikujesz go później.
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
                placeholder="Konferencja EventFlow 2026"
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
                placeholder="konferencja-eventflow-2026"
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
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ends_at">Koniec</Label>
                <Input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
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
              <Input id="location" name="location" placeholder="Warszawa" />
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
            {state.status === "error" && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Tworzenie..." : "Utwórz event"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
