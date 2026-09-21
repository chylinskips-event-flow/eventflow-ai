"use client";

import { useState } from "react";
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

export function LotteryClient({
  pointsPerTicket,
  eligible,
}: {
  pointsPerTicket: number;
  eligible: Attendee[];
}) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [winner, setWinner] = useState<Attendee | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const pool = eligible.filter((a) => !excludedIds.has(a.id));

  function draw() {
    if (pool.length === 0) return;
    setIsDrawing(true);

    // Ważone losowanie — każdy bilet to jeden "kupon" w puli
    const tickets: Attendee[] = [];
    for (const a of pool) {
      const count = Math.floor(a.points / pointsPerTicket);
      for (let i = 0; i < count; i++) {
        tickets.push(a);
      }
    }

    // Krótka animacja (300ms), potem wylosowanie
    setTimeout(() => {
      const idx = Math.floor(Math.random() * tickets.length);
      setWinner(tickets[idx]);
      setIsDrawing(false);
    }, 300);
  }

  function excludeWinner() {
    if (!winner) return;
    setExcludedIds((prev) => new Set([...prev, winner.id]));
    setWinner(null);
  }

  function reset() {
    setExcludedIds(new Set());
    setWinner(null);
  }

  const totalTickets = pool.reduce(
    (sum, a) => sum + Math.floor(a.points / pointsPerTicket),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Wynik losowania */}
      {winner && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Wylosowany uczestnik</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xl font-semibold">
                  {[winner.first_name, winner.last_name].filter(Boolean).join(" ") || "Uczestnik"}
                </span>
                {winner.company && (
                  <span className="text-sm text-muted-foreground">{winner.company}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {winner.points} pkt ·{" "}
                  {Math.floor(winner.points / pointsPerTicket)} biletów
                </span>
              </div>
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
          {pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pula losowania jest pusta — wszyscy kwalifikujący się uczestnicy
              zostali wykluczeni lub nikt nie ma wystarczającej liczby punktów.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {pool.length} uczestników · {totalTickets} biletów
                {excludedIds.size > 0 && (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                    ({excludedIds.size} wykluczonych)
                  </span>
                )}
              </div>
              <Button onClick={draw} disabled={isDrawing || pool.length === 0}>
                {isDrawing ? "Losowanie..." : "Losuj"}
              </Button>
            </div>
          )}

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
