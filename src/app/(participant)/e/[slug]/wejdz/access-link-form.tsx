"use client";

import { useActionState } from "react";
import { requestAccessLink } from "./actions";
import type { AccessLinkState } from "@/lib/access-link-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AccessLinkState = { status: "idle" };

export function AccessLinkForm({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    requestAccessLink.bind(null, slug),
    initialState,
  );

  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-3 text-sm">
        {state.message} Sprawdź skrzynkę (także folder spam) i otwórz link na tym urządzeniu.
      </p>
    );
  }

  const isError = state.status !== "idle";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="access-email">Adres e-mail</Label>
        <Input
          id="access-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          className="h-11"
          aria-invalid={state.status === "invalid" || undefined}
          aria-describedby={isError ? "access-email-msg" : undefined}
        />
      </div>
      {isError && state.message && (
        <p id="access-email-msg" role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Wysyłanie…" : "Wyślij link"}
      </Button>
    </form>
  );
}
