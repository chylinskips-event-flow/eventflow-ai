"use client";

import { useActionState } from "react";
import { completeFreeCheckout, type FreeCheckoutState } from "./actions";
import type { TicketType } from "@/lib/tickets";
import { formatPrice } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const init: FreeCheckoutState = { status: "idle" };

export function CheckoutForm({
  eventId,
  slug,
  ticket,
}: {
  eventId: string;
  slug: string;
  ticket: TicketType;
}) {
  const action = completeFreeCheckout.bind(null, eventId, slug, ticket.id);
  const [state, formAction, isPending] = useActionState(action, init);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {/* Ticket summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wybrany bilet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{ticket.name}</div>
              {ticket.description && (
                <div className="text-sm text-muted-foreground">{ticket.description}</div>
              )}
            </div>
            <div className="text-xl font-bold">{formatPrice(ticket.price)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <form action={formAction} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="co-first">Imię *</Label>
            <Input id="co-first" name="first_name" required maxLength={100} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-last">Nazwisko *</Label>
            <Input id="co-last" name="last_name" required maxLength={100} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="co-email">Adres e-mail *</Label>
          <Input id="co-email" name="email" type="email" required maxLength={255} />
          <p className="text-xs text-muted-foreground">
            Na ten adres wyślemy bilet z kodem QR.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="co-gdpr"
              name="gdpr_consent"
              value="1"
              required
              className="mt-0.5"
            />
            <Label htmlFor="co-gdpr" className="font-normal leading-relaxed">
              Wyrażam zgodę na przetwarzanie moich danych osobowych przez organizatora
              w celu uczestnictwa w wydarzeniu. *
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="co-marketing"
              name="marketing_consent"
              value="on"
              className="mt-0.5"
            />
            <Label htmlFor="co-marketing" className="font-normal leading-relaxed">
              Wyrażam zgodę na przesyłanie informacji marketingowych przez organizatora.
            </Label>
          </div>
        </div>

        {state.status === "error" && state.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending
            ? "Przetwarzanie..."
            : ticket.price === 0
            ? "Zarejestruj się bezpłatnie"
            : "Przejdź do płatności"}
        </Button>
      </form>
    </div>
  );
}
