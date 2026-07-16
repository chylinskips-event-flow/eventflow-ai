"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GOAL_OPTIONS, NO_GOAL_VALUE } from "@/lib/attendee-options";
import { cn } from "@/lib/utils";
import { updateAttendeeProfile, type UpdateProfileState } from "./actions";

const LOOKING_FOR_MAX = 200;

export function ProfileForm({
  slug,
  interestOptions,
  company,
  jobTitle,
  industry,
  interests: initialInterests,
  goal: initialGoal,
  lookingFor: initialLookingFor,
}: {
  slug: string;
  interestOptions: string[];
  company: string | null;
  jobTitle: string | null;
  industry: string | null;
  interests: string[];
  goal: string | null;
  lookingFor: string | null;
}) {
  const [interests, setInterests] = useState<string[]>(initialInterests);
  const [goal, setGoal] = useState(initialGoal ?? NO_GOAL_VALUE);
  const [lookingFor, setLookingFor] = useState(initialLookingFor ?? "");
  const [state, setState] = useState<UpdateProfileState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateAttendeeProfile(slug, formData);
      setState(result);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="company">Firma (opcjonalnie)</Label>
        <Input id="company" name="company" defaultValue={company ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="job_title">Stanowisko (opcjonalnie)</Label>
        <Input id="job_title" name="job_title" defaultValue={jobTitle ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="industry">Branża (opcjonalnie)</Label>
        <Input id="industry" name="industry" defaultValue={industry ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Zainteresowania (opcjonalnie)</Label>
        <div className="flex flex-wrap gap-2">
          {interestOptions.map((option) => {
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
          <SelectTrigger id="goal" className="w-full">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="looking_for">Czego szukasz na tym wydarzeniu?</Label>
        <Textarea
          id="looking_for"
          name="looking_for"
          value={lookingFor}
          onChange={(e) => setLookingFor(e.target.value)}
          maxLength={LOOKING_FOR_MAX}
          placeholder="Np. szukam dostawcy systemu HR, partnera do projektu, inwestora..."
        />
        <p className="self-end text-xs text-muted-foreground">
          {lookingFor.length}/{LOOKING_FOR_MAX}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Zapisywanie..." : "Zapisz zmiany"}
        </Button>
        {state.status === "success" && (
          <span className="text-sm text-muted-foreground">{state.message}</span>
        )}
        {state.status === "error" && (
          <span className="text-sm text-destructive">{state.message}</span>
        )}
      </div>
    </form>
  );
}
