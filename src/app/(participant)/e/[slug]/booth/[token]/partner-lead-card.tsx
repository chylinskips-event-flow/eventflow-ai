"use client";

import { useActionState, useState, useTransition } from "react";
import { MessageSquareText, UserRoundPlus } from "lucide-react";
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
 * Osobna zgoda na przekazanie danych partnerowi (#10 Faza B), opcjonalnie z jego pytaniami.
 * Niezależna od check-inu i punktów: dobrowolna, domyślnie niezaznaczona, bez niej nic nie
 * zapisujemy. Po wycofaniu formularz wraca — uczestnik może wyrazić zgodę ponownie.
 */
export function PartnerLeadCard({
  slug,
  partnerToken,
  partnerName,
  questions,
  consentText,
  consentVersion,
  activeConsentId,
}: {
  slug: string;
  partnerToken: string;
  partnerName: string;
  questions: PublicQuestion[];
  consentText: string;
  consentVersion: string;
  activeConsentId: string | null;
}) {
  const [consentId, setConsentId] = useState<string | null>(activeConsentId);
  const [justWithdrawn, setJustWithdrawn] = useState(false);
  // Nowy klucz formularza = czyste pola po wycofaniu zgody.
  const [formKey, setFormKey] = useState(0);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isWithdrawing, startWithdraw] = useTransition();
  const [state, formAction, isPending] = useActionState(async (prev: PartnerLeadState, fd: FormData) => {
    const res = await submitPartnerLead(slug, partnerToken, prev, fd);
    if (res.status === "success") {
      setConsentId(res.consentId);
      setJustWithdrawn(false);
    }
    return res;
  }, idle);

  const hasQuestions = questions.length > 0;
  const Icon = hasQuestions ? MessageSquareText : UserRoundPlus;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-primary" />
            <CardTitle>{hasQuestions ? `Pytania od ${partnerName}` : `Zostaw kontakt dla ${partnerName}`}</CardTitle>
          </div>
          <CardDescription>
            {hasQuestions
              ? "Opcjonalne. Odpowiedzi i dane kontaktowe trafią do partnera tylko, jeśli zaznaczysz zgodę."
              : "Opcjonalne. Twoje dane kontaktowe trafią do partnera tylko, jeśli zaznaczysz zgodę."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consentId ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Dziękujemy! {hasQuestions ? "Twoje odpowiedzi i dane kontaktowe zostały" : "Twoje dane kontaktowe zostały"}{" "}
                przekazane firmie <strong>{partnerName}</strong>
                {partnerName.endsWith(".") ? "" : "."}
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
                      setConsentId(null);
                      setJustWithdrawn(true);
                      setWithdrawError(null);
                      setFormKey((k) => k + 1);
                    } else setWithdrawError(res.message ?? "Nie udało się wycofać zgody.");
                  })
                }
              >
                {isWithdrawing ? "Wycofywanie…" : "Wycofaj zgodę"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {justWithdrawn && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Zgoda wycofana — {hasQuestions ? "Twoje odpowiedzi zostały usunięte, a " : ""}partner nie zobaczy Cię
                  na liście kontaktów. Jeśli zmienisz zdanie, możesz wyrazić zgodę ponownie poniżej.
                </p>
              )}
              <form key={formKey} action={formAction} className="flex flex-col gap-4">
                <input type="hidden" name="consent_version" value={consentVersion} />
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
                  {/* block (nie flex z Label): zdanie zgody jest jednym akapitem; treść draft-2026-10 bez zmian. */}
                  <Label htmlFor="partner_consent" className="block cursor-pointer text-sm font-normal leading-relaxed">
                    {consentText}
                  </Label>
                </div>

                {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

                <Button type="submit" variant="outline" disabled={isPending} className="w-full">
                  {isPending ? "Wysyłanie…" : hasQuestions ? `Wyślij do ${partnerName}` : `Przekaż kontakt firmie ${partnerName}`}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
