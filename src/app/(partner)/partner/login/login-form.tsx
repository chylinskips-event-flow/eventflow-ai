"use client";

import { useActionState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPartnerLoginLink, type PartnerLoginState } from "../actions";

const initial: PartnerLoginState = { status: "idle" };

export function PartnerLoginForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction, isPending] = useActionState(sendPartnerLoginLink, initial);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Panel partnera</CardTitle>
          <CardDescription>Logowanie bez hasła — wyślemy jednorazowy link na Twój adres e-mail.</CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "sent" ? (
            <p className="text-sm text-muted-foreground">
              Jeśli ten adres ma dostęp do panelu partnera, za chwilę dostaniesz e-mail z linkiem
              logowania. Sprawdź też folder spam.
            </p>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required defaultValue={defaultEmail} placeholder="ty@firma.pl" />
              </div>
              {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Wysyłanie…" : "Wyślij link logowania"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
