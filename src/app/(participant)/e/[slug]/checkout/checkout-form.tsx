"use client";

import { useActionState } from "react";
import { completeFreeCheckout, startPaidCheckout, type FreeCheckoutState, type PaidCheckoutState } from "./actions";
import type { TicketType } from "@/lib/tickets";
import { formatPrice } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag } from "lucide-react";

const init: FreeCheckoutState = { status: "idle" };

function DiscountCodeField() {
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <Tag className="size-3.5" />
        Mam kod rabatowy
      </summary>
      <div className="mt-2 space-y-1.5">
        <Label htmlFor="co-discount">Kod rabatowy</Label>
        <Input
          id="co-discount"
          name="discount_code"
          maxLength={50}
          placeholder="np. EARLYBIRD2026"
          className="uppercase"
        />
      </div>
    </details>
  );
}

export function CheckoutForm({
  eventId,
  slug,
  ticket,
}: {
  eventId: string;
  slug: string;
  ticket: TicketType;
}) {
  const isFree = ticket.price === 0;

  const freeAction = completeFreeCheckout.bind(null, eventId, slug, ticket.id);
  const paidAction = startPaidCheckout.bind(null, eventId, slug, ticket.id);

  // Hooks must be called unconditionally
  const [freeState, freeFormAction, isFreeP] = useActionState<FreeCheckoutState, FormData>(freeAction, init);
  const [paidState, paidFormAction, isPaidP] = useActionState<PaidCheckoutState, FormData>(paidAction, init);

  const state = isFree ? freeState : paidState;
  const formAction = isFree ? freeFormAction : paidFormAction;
  const isPending = isFree ? isFreeP : isPaidP;

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
            <div className="text-2xl font-bold">{formatPrice(ticket.price)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <form action={formAction} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="co-first">Imie *</Label>
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
            Na ten adres wyslemy bilet z kodem QR.
          </p>
        </div>

        {!isFree && <DiscountCodeField />}

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
              Wyrazam zgode na przetwarzanie moich danych osobowych przez organizatora
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
              Wyrazam zgode na przesylanie informacji marketingowych przez organizatora.
            </Label>
          </div>
        </div>

        {state.status === "error" && state.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending
            ? "Przetwarzanie..."
            : isFree
            ? "Zarejestruj sie bezplatnie"
            : `Przejdz do platnosci — ${formatPrice(ticket.price)}`}
        </Button>

        {!isFree && (
          <p className="text-center text-xs text-muted-foreground">
            Zostaniesz przekierowany do bezpiecznej strony Przelewy24 (BLIK, karta, przelew).
          </p>
        )}
      </form>
    </div>
  );
}
