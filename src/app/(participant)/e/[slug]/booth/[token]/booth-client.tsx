"use client";

import { useActionState } from "react";
import { submitBoothVisit, type BoothActionState } from "./actions";
import type { Partner } from "@/lib/partners";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Typ questa przekazywany do klienta — correct_id i password NIGDY nie wychodzą z serwera.
export type BoothQuestForClient =
  | { id: string; type: "booth_quiz"; title: string; points_value: number;
      question: string; options: { id: string; label: string }[] }
  | { id: string; type: "booth_password"; title: string; points_value: number }
  | { id: string; type: "booth_visit"; title: string; points_value: number }
  | null;

const LEVEL_LABELS: Record<string, string> = {
  explorer: "Explorer",
  connector: "Connector",
  ambassador: "Ambassador",
};

const initialState: BoothActionState = { status: "idle" };

export function BoothClient({
  slug,
  partnerToken,
  partner,
  quest,
  initialAttemptsUsed,
}: {
  slug: string;
  partnerToken: string;
  partner: Pick<Partner, "id" | "name" | "logo_url" | "description" | "tier" | "booth_location">;
  quest: BoothQuestForClient;
  initialAttemptsUsed: number;
}) {
  const boundAction = submitBoothVisit.bind(null, slug, partnerToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const attemptsUsed =
    state.status === "wrong_answer" ? state.attemptsUsed : initialAttemptsUsed;
  const attemptsExhausted =
    state.status === "no_attempts" || attemptsUsed >= 2;

  if (state.status === "success") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl dark:bg-green-900/40">
              ✓
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xl font-semibold">Stoisko odwiedzone!</p>
              {state.pointsAwarded > 0 && (
                <p className="text-3xl font-bold text-primary">
                  +{state.pointsAwarded} pkt
                </p>
              )}
              {state.levelUp && (
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Nowy poziom: {LEVEL_LABELS[state.newLevel] ?? state.newLevel}!
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Dziękujemy za odwiedziny stoiska {partner.name}.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      {/* Karta partnera */}
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          {partner.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partner.logo_url}
              alt={partner.name}
              className="h-16 w-16 shrink-0 rounded-md object-contain"
            />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-lg font-semibold">{partner.name}</span>
            {partner.tier && (
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {partner.tier}
              </span>
            )}
            {partner.booth_location && (
              <span className="text-sm text-muted-foreground">
                Stoisko: {partner.booth_location}
              </span>
            )}
            {partner.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {partner.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <form action={formAction} className="flex flex-col gap-4">
        {/* Quest UI */}
        {quest && (
          <Card>
            <CardContent className="flex flex-col gap-4 py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{quest.title}</p>
                {quest.points_value > 0 && (
                  <span className="text-sm font-semibold text-primary">
                    +{quest.points_value} pkt
                  </span>
                )}
              </div>

              {quest.type === "booth_quiz" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">{quest.question}</p>
                  <div className="flex flex-col gap-2">
                    {quest.options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      >
                        <input
                          type="radio"
                          name="answer_id"
                          value={opt.id}
                          required
                          disabled={isPending || attemptsExhausted}
                          className="accent-primary"
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {attemptsUsed === 1 && !attemptsExhausted && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Ostatnia próba — za poprawną odpowiedź otrzymasz {Math.floor(quest.points_value / 2)} pkt.
                    </p>
                  )}
                </div>
              )}

              {quest.type === "booth_password" && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    Zapytaj o hasło przy stoisku partnera.
                  </p>
                  <Input
                    name="password"
                    placeholder="Wpisz hasło"
                    autoComplete="off"
                    required
                    disabled={isPending || attemptsExhausted}
                  />
                  {attemptsUsed === 1 && !attemptsExhausted && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Ostatnia próba — za poprawne hasło otrzymasz {Math.floor(quest.points_value / 2)} pkt.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Zgoda leadowa */}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox id="lead_consent" name="lead_consent" disabled={isPending} />
          <Label htmlFor="lead_consent" className="cursor-pointer text-sm font-normal leading-relaxed">
            Wyrażam zgodę na przekazanie moich danych kontaktowych (imię, nazwisko,
            firma, email) partnerowi <strong>{partner.name}</strong> w celach
            marketingowych i handlowych.
          </Label>
        </div>

        {/* Błędy i stany */}
        {state.status === "wrong_answer" && (
          <p className="text-sm text-destructive">
            Niepoprawna odpowiedź.{" "}
            {attemptsUsed < 2
              ? "Możesz spróbować jeszcze raz."
              : "Wyczerpano próby."}
          </p>
        )}
        {state.status === "no_attempts" && (
          <p className="text-sm text-destructive">Wyczerpano liczbę prób.</p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <Button
          type="submit"
          disabled={isPending || attemptsExhausted}
          className="w-full"
        >
          {isPending
            ? "Zapisywanie..."
            : quest?.type === "booth_visit" || !quest
              ? "Zarejestruj odwiedziny"
              : "Zatwierdź odpowiedź"}
        </Button>
      </form>
    </main>
  );
}
