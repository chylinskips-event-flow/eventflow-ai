"use client";

import { useState, useTransition } from "react";
import { drawLotteryWinner } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Attendee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  points: number;
};

type Winner = Attendee & { tickets: number };

export function LotteryClient({
  eventId,
  pointsPerTicket,
  eligible,
}: {
  eventId: string;
  pointsPerTicket: number;
  eligible: Attendee[];
}) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [winner, setWinner] = useState<Winner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const poolSize = eligible.filter((a) => !excludedIds.has(a.id)).length;
  const totalTickets = eligible
    .filter((a) => !excludedIds.has(a.id))
    .reduce((s, a) => s + Math.floor(a.points / pointsPerTicket), 0);

  function draw() {
    setError(null);
    startTransition(async () => {
      const result = await drawLotteryWinner(eventId, [...excludedIds]);
      if (result.status === "error") {
        setError(result.message);
      } else if (result.status === "empty") {
        setError("Pula losowania jest pusta.");
      } else {
        setWinner(result.winner);
      }
    });
  }

  function excludeWinner() {
    if (!winner) return;
    setExcludedIds((prev) => new Set([...prev, winner.id]));
    setWinner(null);
  }

  function reset() {
    setExcludedIds(new Set());
    setWinner(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Wynik losowania */}
      {winner && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Wylosowany uczestnik</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col">
              <span className="text-xl font-semibold">
                {[winner.first_name, winner.last_name].filter(Boolean).join(" ") || "Uczestnik"}
              </span>
              {winner.company && (
                <span className="text-sm text-muted-foreground">{winner.company}</span>
              )}
              <span className="text-sm text-muted-foreground">
                {winner.points} pkt · {winner.tickets} biletów
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={excludeWinner}>
                Wyklucz i losuj dalej
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWinner(null)}>
                Zamknij
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kontrolki */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {poolSize === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pula losowania jest pusta — wszyscy kwalifikujący się uczestnicy
              zostali wykluczeni lub nikt nie ma wystarczającej liczby punktów.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {poolSize} uczestników · {totalTickets} biletów
                {excludedIds.size > 0 && (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                    ({excludedIds.size} wykluczonych)
                  </span>
                )}
              </div>
              <Button onClick={draw} disabled={isPending || poolSize === 0}>
                {isPending ? "Losowanie..." : "Losuj"}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {excludedIds.size > 0 && (
            <Button variant="ghost" size="sm" className="self-start" onClick={reset}>
              Resetuj wykluczenia
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lista uczestników z pulą biletów */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Kwalifikujący się uczestnicy ({eligible.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pb-4">
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Żaden uczestnik nie ma jeszcze wystarczającej liczby punktów.
            </p>
          ) : (
            eligible.map((a) => {
              const excluded = excludedIds.has(a.id);
              const tickets = Math.floor(a.points / pointsPerTicket);
              return (
                <div
                  key={a.id}
                  className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                    excluded ? "opacity-40" : ""
                  }`}
                >
                  <span>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || "Uczestnik"}
                    {a.company && (
                      <span className="ml-1 text-muted-foreground">· {a.company}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{tickets} biletów</Badge>
                    {excluded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() =>
                          setExcludedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(a.id);
                            return next;
                          })
                        }
                      >
                        Przywróć
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
