"use client";

import { useActionState } from "react";
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

// Jedno pole: nazwa firmy lub marki. Wewnętrzny identyfikator organizacji (slug) powstaje
// automatycznie z nazwy, a e-mail do rozliczeń to adres z logowania (createOrganization).
export function OnboardingForm({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(
    createOrganization,
    initialState,
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Skonfiguruj swoją organizację</CardTitle>
          <CardDescription>
            Ta nazwa będzie widoczna dla uczestników i partnerów Twoich wydarzeń.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nazwa Twojej firmy lub marki</Label>
              <Input
                id="name"
                name="name"
                placeholder="np. Next Stop"
                maxLength={200}
                autoComplete="organization"
                required
              />
            </div>
            {email && (
              <p className="text-xs text-muted-foreground">
                Sprawy rozliczeń będą trafiać na adres, którym się logujesz:{" "}
                <span className="break-all font-medium text-foreground">{email}</span>.
              </p>
            )}
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
