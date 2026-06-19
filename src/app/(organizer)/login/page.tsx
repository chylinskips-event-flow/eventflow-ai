"use client";

import { useActionState } from "react";
import { signInWithMagicLink, type MagicLinkState } from "./actions";
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

const initialState: MagicLinkState = { status: "idle" };

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    signInWithMagicLink,
    initialState,
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Logowanie organizatora</CardTitle>
          <CardDescription>
            Wyślemy Ci link logowania na podany adres email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "sent" ? (
            <p className="text-sm text-muted-foreground">
              Sprawdź swoją skrzynkę email.
            </p>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="ty@firma.pl"
                  required
                />
              </div>
              {state.status === "error" && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Wysyłanie..." : "Wyślij link logowania"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
