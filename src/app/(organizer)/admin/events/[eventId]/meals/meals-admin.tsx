"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, Download, Link2, QrCode, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MEAL_NAME_MAX, type MealSummary } from "@/lib/meals-shared";
import { addMeal, disableMealLink, removeMeal, renewMealLink } from "./actions";

export function MealsAdmin({
  eventId,
  meals,
  staffBaseUrl,
}: {
  eventId: string;
  meals: MealSummary[];
  staffBaseUrl: string;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addMeal(eventId, name);
      if (result.ok) setName("");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Np. Lunch, 12 listopada"
          value={name}
          maxLength={MEAL_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nazwa posiłku"
        />
        <Button type="submit" disabled={pending || !name.trim()} className="shrink-0">
          Dodaj posiłek
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {meals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nie ma jeszcze żadnego posiłku.</p>
      ) : (
        meals.map((meal) => (
          <MealCard key={meal.id} eventId={eventId} meal={meal} staffBaseUrl={staffBaseUrl} />
        ))
      )}
    </div>
  );
}

function MealCard({
  eventId,
  meal,
  staffBaseUrl,
}: {
  eventId: string;
  meal: MealSummary;
  staffBaseUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const base = `/admin/events/${eventId}/meals/${meal.id}`;
  const staffUrl = meal.access_token ? `${staffBaseUrl}/${meal.access_token}` : null;

  async function handleCopy() {
    if (!staffUrl) return;
    try {
      await navigator.clipboard.writeText(staffUrl);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await removeMeal(eventId, meal.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="min-w-0 break-words font-medium">{meal.name}</p>
          <p className="text-sm text-muted-foreground">Wydano: {meal.redeemed}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={base} className={buttonVariants({ size: "sm" })}>
            <QrCode className="mr-1.5 size-4" />
            Wydawaj
          </Link>
          <a href={`${base}/rozliczenie.csv`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <Download className="mr-1.5 size-4" />
            Rozliczenie CSV
          </a>
          {staffUrl ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
                {copied ? "Skopiowano" : "Kopiuj link obsługi"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => startTransition(() => renewMealLink(eventId, meal.id))}
              >
                <RefreshCw className="mr-1.5 size-4" />
                Nowy link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => startTransition(() => disableMealLink(eventId, meal.id))}
              >
                <ShieldOff className="mr-1.5 size-4" />
                Wyłącz link
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => startTransition(() => renewMealLink(eventId, meal.id))}
            >
              <Link2 className="mr-1.5 size-4" />
              Utwórz link obsługi
            </Button>
          )}
          {meal.redeemed === 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={handleDelete}
              className="text-destructive"
            >
              <Trash2 className="mr-1.5 size-4" />
              Usuń
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
