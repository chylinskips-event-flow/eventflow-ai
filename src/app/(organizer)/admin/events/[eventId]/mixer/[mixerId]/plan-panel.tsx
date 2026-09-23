"use client";

import { useState, useTransition } from "react";
import { Pencil, RefreshCw, Check, X, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { updateIcebreaker, replaceIcebreaker } from "../actions";
import type { PlanRound, QualityJson } from "@/lib/mixer/getters";

type Props = {
  eventId: string;
  mixerId: string;
  plan: PlanRound[];
  quality: QualityJson | null;
  breakAfterRound: number | null;
};

function QualityReport({ quality }: { quality: QualityJson }) {
  const metrics = [
    { label: "Min spotkań",     value: quality.uniqueMeetingsMin, good: quality.uniqueMeetingsMin > 5  },
    { label: "Mediana spotkań", value: quality.uniqueMeetingsMed, good: quality.uniqueMeetingsMed > 10 },
    { label: "Max spotkań",     value: quality.uniqueMeetingsMax, good: true },
    { label: "Powtórzone pary", value: quality.repeatedPairs,     good: quality.repeatedPairs === 0, bad: quality.repeatedPairs > 5 },
    { label: "Incydenty klas.", value: quality.clusterIncidents,  good: quality.clusterIncidents === 0, bad: quality.clusterIncidents > 0 },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">Raport jakości</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className={`flex flex-col items-center rounded-xl border px-3 py-3 text-center ${
              m.bad
                ? "border-destructive/40 bg-destructive/5"
                : m.good
                ? "border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-950/20"
                : "bg-muted/30"
            }`}
          >
            <span className="text-2xl font-bold tabular-nums">{m.value}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IcebreakerEdit({
  icebreakerId,
  mixerId,
  eventId,
  question,
  isCustom,
}: {
  icebreakerId: string;
  mixerId: string;
  eventId: string;
  question: string;
  isCustom: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(question);
  const [isPending, start] = useTransition();

  function handleSave() {
    start(async () => {
      await updateIcebreaker(icebreakerId, mixerId, eventId, value);
      setEditing(false);
    });
  }

  function handleReplace() {
    start(async () => {
      await replaceIcebreaker(icebreakerId, mixerId, eventId);
    });
  }

  if (editing) {
    return (
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 text-sm flex-1"
          autoFocus
        />
        <Button size="sm" variant="ghost" onClick={handleSave} disabled={isPending}>
          <Check className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(question); }}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <p className="flex-1 text-sm text-muted-foreground">{question}</p>
      <div className="flex shrink-0 gap-0.5">
        {isCustom && <Badge variant="outline" className="text-[10px] px-1 py-0">custom</Badge>}
        <Button
          size="sm"
          variant="ghost"
          className="size-7 p-0"
          onClick={() => setEditing(true)}
          title="Edytuj pytanie"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="size-7 p-0"
          onClick={handleReplace}
          disabled={isPending}
          title="Wymień na inne pytanie z banku"
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function RoundsView({
  plan,
  breakAfterRound,
  eventId,
  mixerId,
}: {
  plan: PlanRound[];
  breakAfterRound: number | null;
  eventId: string;
  mixerId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {plan.map((round) => (
        <div key={round.roundNumber}>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-semibold">Runda {round.roundNumber}</h3>
            {breakAfterRound === round.roundNumber && (
              <Badge variant="warning">Przerwa po tej rundzie</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {round.tables.map((table) => (
              <div key={table.tableNumber} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Stół {table.tableNumber}</span>
                  <span className="text-xs text-muted-foreground">{table.participants.length} os.</span>
                </div>
                <ul className="text-sm space-y-0.5">
                  {table.participants.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-1 rounded-full bg-muted-foreground/40 shrink-0" />
                      {p.display_name}
                      {p.company && <span className="text-xs opacity-60">· {p.company}</span>}
                    </li>
                  ))}
                </ul>
                {table.icebreakerId && (
                  <div className="border-t pt-2 mt-1">
                    <IcebreakerEdit
                      icebreakerId={table.icebreakerId}
                      mixerId={mixerId}
                      eventId={eventId}
                      question={table.question ?? ""}
                      isCustom={table.icebreakerIsCustom}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParticipantPathView({ plan }: { plan: PlanRound[] }) {
  const [query, setQuery] = useState("");

  // Build map: participantId → name
  const nameMap = new Map<string, string>();
  for (const round of plan) {
    for (const table of round.tables) {
      for (const p of table.participants) {
        nameMap.set(p.id, p.display_name);
      }
    }
  }

  // Build path map: participantId → [{roundNumber, tableNumber}]
  const pathMap = new Map<string, { roundNumber: number; tableNumber: number }[]>();
  for (const round of plan) {
    for (const table of round.tables) {
      for (const p of table.participants) {
        if (!pathMap.has(p.id)) pathMap.set(p.id, []);
        pathMap.get(p.id)!.push({ roundNumber: round.roundNumber, tableNumber: table.tableNumber });
      }
    }
  }

  const filtered = [...nameMap.entries()].filter(([, name]) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Szukaj uczestnika..."
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {query.trim() === "" ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          Wpisz imię lub nazwisko uczestnika, aby zobaczyć jego ścieżkę.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">Brak wyników.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(([id, name]) => {
            const path = pathMap.get(id) ?? [];
            return (
              <div key={id} className="rounded-xl border bg-card p-4">
                <p className="font-medium mb-2">{name}</p>
                <div className="flex flex-wrap gap-2">
                  {path.map((p) => (
                    <Badge key={p.roundNumber} variant="outline">
                      R{p.roundNumber} → Stół {p.tableNumber}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PlanPanel({ eventId, mixerId, plan, quality, breakAfterRound }: Props) {
  if (plan.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Plan nie został jeszcze wygenerowany.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {quality && <QualityReport quality={quality} />}

      <Tabs defaultValue="rundy">
        <TabsList>
          <TabsTrigger value="rundy">Rundy</TabsTrigger>
          <TabsTrigger value="uczestnicy">
            <Users className="size-3.5 mr-1" />
            Uczestnicy
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rundy" className="mt-4">
          <RoundsView
            plan={plan}
            breakAfterRound={breakAfterRound}
            eventId={eventId}
            mixerId={mixerId}
          />
        </TabsContent>
        <TabsContent value="uczestnicy" className="mt-4">
          <ParticipantPathView plan={plan} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
