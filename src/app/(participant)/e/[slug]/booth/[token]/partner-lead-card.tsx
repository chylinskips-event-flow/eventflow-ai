"use client";

import { useActionState, useState, useTransition } from "react";
import { MessageSquareText } from "lucide-react";
import type { PublicQuestion } from "@/lib/partner-leads-core";
import { ANSWER_MAX_LENGTH } from "@/lib/partner-leads-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  submitPartnerLead,
  withdrawPartnerConsent,
  type PartnerLeadState,
} from "../../partner-lead-actions";

const idle: PartnerLeadState = { status: "idle" };

/**
 * Pytania sponsora + osobna zgoda (#10 Faza B). Niezależna od check-inu i punktów:
 * zgoda jest dobrowolna, domyślnie niezaznaczona, bez niej nic nie zapisujemy.
 */
export function PartnerLeadCard({
  slug,
  partnerToken,
  partnerName,
  questions,
  consentText,
  activeConsentId,
}: {
  slug: string;
  partnerToken: string;
  partnerName: string;
  questions: PublicQuestion[];
  consentText: string;
  activeConsentId: string | null;
}) {
  const [state, formAction, isPending] = useActionState(submitPartnerLead.bind(null, slug, partnerToken), idle);
  const [withdrawn, setWithdrawn] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isWithdrawing, startWithdraw] = useTransition();

  const consentId = withdrawn ? null : state.status === "success" ? state.consentId : activeConsentId;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-5 text-primary" />
            <CardTitle>Pytania od {partnerName}</CardTitle>
          </div>
          <CardDescription>
            Opcjonalne. Odpowiedzi i dane kontaktowe trafią do partnera tylko, jeśli zaznaczysz zgodę.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consentId ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Dziękujemy! Twoje odpowiedzi i dane kontaktowe zostały przekazane firmie <strong>{partnerName}</strong>.
              </p>
              <p className="text-muted-foreground">Zgodę możesz wycofać w każdej chwili — tutaj albo w swoim profilu.</p>
              {withdrawError && <p className="text-destructive">{withdrawError}</p>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={isWithdrawing}
                onClick={() =>
                  startWithdraw(async () => {
                    const res = await withdrawPartnerConsent(slug, consentId);
                    if (res.ok) {
                      setWithdrawn(true);
                      setWithdrawError(null);
                    } else setWithdrawError(res.message ?? "Nie udało się wycofać zgody.");
                  })
                }
              >
                {isWithdrawing ? "Wycofywanie…" : "Wycofaj zgodę"}
              </Button>
            </div>
          ) : withdrawn ? (
            <p className="text-sm text-muted-foreground">
              Zgoda wycofana — Twoje odpowiedzi zostały usunięte, a partner nie zobaczy Cię na liście kontaktów.
            </p>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              {questions.map((q) => (
                <fieldset key={q.id} className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">{q.prompt}</legend>
                  {q.kind === "single_choice" ? (
                    <div className="flex flex-col gap-2">
                      {q.options.map((o) => (
                        <label
                          key={o.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <input type="radio" name={`q_${q.id}`} value={o.id} disabled={isPending} className="accent-primary" />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input name={`q_${q.id}`} maxLength={ANSWER_MAX_LENGTH} disabled={isPending} aria-label={q.prompt} />
                  )}
                </fieldset>
              ))}

              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox id="partner_consent" name="partner_consent" disabled={isPending} />
                <Label htmlFor="partner_consent" className="cursor-pointer text-sm font-normal leading-relaxed">
                  {consentText}
                </Label>
              </div>

              {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

              <Button type="submit" variant="outline" disabled={isPending} className="w-full">
                {isPending ? "Wysyłanie…" : `Wyślij do ${partnerName}`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
