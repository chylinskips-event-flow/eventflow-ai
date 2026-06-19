"use client";

import { useActionState, useState } from "react";
import { createOrganization, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: OnboardingState = { status: "idle" };

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function OnboardingForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, isPending] = useActionState(
    createOrganization,
    initialState,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Skonfiguruj swoją organizację</CardTitle>
          <CardDescription>
            Te dane będą widoczne dla uczestników i partnerów Twoich eventów.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nazwa organizacji</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Moja Firma"
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
                placeholder="moja-firma"
                pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="billing_email">Email do rozliczeń</Label>
              <Input
                id="billing_email"
                name="billing_email"
                type="email"
                defaultValue={defaultEmail}
                required
              />
            </div>
            {state.status === "error" && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Zapisywanie..." : "Utwórz organizację"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
