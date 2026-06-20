"use client";

import { useActionState, useState } from "react";
import { registerAttendee, type RegisterAttendeeState } from "./actions";
import type { Event } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const initialState: RegisterAttendeeState = { status: "idle" };
const NO_GOAL_VALUE = "__none__";

const INTEREST_OPTIONS = [
  "AI",
  "SaaS",
  "Marketing",
  "Sprzedaż",
  "HR",
  "Finanse",
  "Produkt",
  "Design",
  "Inne",
];

const GOAL_OPTIONS = [
  { value: "networking", label: "Networking" },
  { value: "wiedza-branzowa", label: "Wiedza branżowa" },
  { value: "poszukiwanie-dostawcow", label: "Poszukiwanie dostawców" },
  { value: "inne", label: "Inne" },
];

export function RegisterForm({ event }: { event: Event }) {
  const action = registerAttendee.bind(null, event.id, event.slug);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [goal, setGoal] = useState(NO_GOAL_VALUE);
  const [interests, setInterests] = useState<string[]>([]);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Rejestracja — {event.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="first_name">Imię</Label>
              <Input
                id="first_name"
                name="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last_name">Nazwisko</Label>
              <Input
                id="last_name"
                name="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company">Firma (opcjonalnie)</Label>
              <Input
                id="company"
                name="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="job_title">Stanowisko (opcjonalnie)</Label>
              <Input
                id="job_title"
                name="job_title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="industry">Branża (opcjonalnie)</Label>
              <Input
                id="industry"
                name="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Zainteresowania (opcjonalnie)</Label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((option) => {
                  const selected = interests.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleInterest(option)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-foreground",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {interests.map((interest) => (
                <input
                  key={interest}
                  type="hidden"
                  name="interests"
                  value={interest}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal">Cel udziału (opcjonalnie)</Label>
              <input
                type="hidden"
                name="goal"
                value={goal === NO_GOAL_VALUE ? "" : goal}
              />
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger id="goal" className="h-12 w-full text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GOAL_VALUE}>Nie wybrano</SelectItem>
                  {GOAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="gdpr_consent" name="gdpr_consent" required className="mt-1" />
              <Label htmlFor="gdpr_consent" className="text-sm leading-snug font-normal">
                Wyrażam zgodę na przetwarzanie moich danych osobowych w celu
                organizacji wydarzenia „{event.name}” zgodnie z RODO.
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="marketing_consent"
                name="marketing_consent"
                className="mt-1"
              />
              <Label htmlFor="marketing_consent" className="text-sm leading-snug font-normal">
                Wyrażam zgodę na otrzymywanie informacji marketingowych
                (opcjonalnie).
              </Label>
            </div>
            {state.status === "error" && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            <Button type="submit" size="lg" disabled={isPending} className="h-12 text-base">
              {isPending ? "Rejestrowanie..." : "Zarejestruj się"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
