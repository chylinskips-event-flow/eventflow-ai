"use client";

import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Network, Coffee, Users, CheckCircle2, Timer } from "lucide-react";
import { SectionHero, SectionHeroMedia } from "@/components/participant/section-hero";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MyMixerData, MyMixerRound } from "@/lib/mixer/participant";

// ── Countdown (client-only, no SSR mismatch) ──────────────────────────────────

function Countdown({
  startedAt,
  roundMinutes,
}: {
  startedAt: string;
  roundMinutes: number;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    function calc() {
      const endMs = new Date(startedAt).getTime() + roundMinutes * 60_000;
      return Math.max(0, endMs - Date.now());
    }
    setRemaining(calc());
    const id = setInterval(() => setRemaining(calc()), 1_000);
    return () => clearInterval(id);
  }, [startedAt, roundMinutes]);

  if (remaining === null) return null;

  if (remaining === 0) {
    return (
      <span className="text-sm font-semibold text-primary-foreground/70">
        czas minął
      </span>
    );
  }

  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1_000);
  return (
    <span className="tabular-nums text-3xl font-bold leading-none text-primary-foreground">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ── LiveNowBlock ───────────────────────────────────────────────────────────────

function LiveNowBlock({
  round,
  roundMinutes,
}: {
  round: MyMixerRound;
  roundMinutes: number;
}) {
  return (
    <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest opacity-60">
        Teraz
      </p>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-bold leading-none">
            Runda {round.roundNumber}
          </p>
          <p className="mt-2 text-2xl font-semibold opacity-90">
            → Stół {round.tableNumber}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {round.startedAt ? (
            <Countdown startedAt={round.startedAt} roundMinutes={roundMinutes} />
          ) : (
            <Timer className="size-8 opacity-40" />
          )}
          <span className="text-xs opacity-50">pozostało</span>
        </div>
      </div>

      {/* Tablemates inline w bloku */}
      {round.tablemates.length > 0 && (
        <div className="mt-4 border-t border-primary-foreground/20 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">
            Przy stole
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {round.tablemates.map((tm) => (
              <span key={tm.display_name} className="text-sm font-medium">
                {tm.display_name}
                {tm.company && (
                  <span className="ml-1 opacity-60 text-xs font-normal">
                    {tm.company}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── RoundCard ──────────────────────────────────────────────────────────────────

function RoundCard({
  round,
  roundMinutes,
  anyLive,
}: {
  round: MyMixerRound;
  roundMinutes: number;
  anyLive: boolean;
}) {
  const isDone    = round.liveStatus === "done";
  const isActive  = round.liveStatus === "active";
  const isPending = round.liveStatus === "pending";

  return (
    <Card
      className={cn(
        "transition-opacity duration-200",
        isDone   && "opacity-40",
        isPending && anyLive && "opacity-60",
        isActive && "border-primary/40 ring-1 ring-primary/25",
      )}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isDone && (
              <CheckCircle2 className="size-4 shrink-0 text-green-500 dark:text-green-400" />
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Runda {round.roundNumber}
              </p>
              <p className={cn(
                "mt-0.5 text-base font-semibold",
                isDone && "text-muted-foreground",
              )}>
                Stół {round.tableNumber}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isActive && (
              <Badge variant="indigo" className="text-xs">Na żywo</Badge>
            )}
            {isDone && (
              <Badge variant="outline" className="text-xs">Zakończona</Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {roundMinutes} min
            </Badge>
          </div>
        </div>

        {/* Icebreaker — ukryty dla zakończonych */}
        {round.question && !isDone && (
          <div className="mb-3 rounded-lg bg-primary/5 px-3 py-2.5 text-sm ring-1 ring-primary/10">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Pytanie lodołamacze
            </p>
            {round.question}
          </div>
        )}

        {/* Tablemates — ukryte dla zakończonych */}
        {round.tablemates.length > 0 && !isDone && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              Przy stole
            </div>
            <ul className="flex flex-col gap-1">
              {round.tablemates.map((tm) => (
                <li key={tm.display_name} className="flex items-baseline gap-1.5 text-sm">
                  <span className="font-medium">{tm.display_name}</span>
                  {tm.company && (
                    <span className="text-xs text-muted-foreground">{tm.company}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── LiveMixerView ──────────────────────────────────────────────────────────────

export function LiveMixerView({
  mixer,
  slug,
}: {
  mixer: MyMixerData;
  slug: string;
}) {
  const router = useRouter();

  // Poll co 12 s gdy mixer jest aktywny
  useEffect(() => {
    if (!mixer.isLive) return;
    const id = setInterval(() => router.refresh(), 12_000);
    return () => clearInterval(id);
  }, [mixer.isLive, router]);

  const activeRound = mixer.rounds.find((r) => r.liveStatus === "active");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Mój"
        headlineAccent="mixer"
        subtitle={mixer.mixerName}
        media={<SectionHeroMedia icon={Network} />}
        backHref={`/e/${slug}`}
      />

      {/* Duży blok TERAZ — tylko gdy aktywna runda */}
      {mixer.isLive && activeRound && (
        <LiveNowBlock round={activeRound} roundMinutes={mixer.roundMinutes} />
      )}

      {/* Baner zakończenia */}
      {mixer.isFinished && (
        <div className="rounded-xl border bg-muted/60 px-5 py-4 text-center">
          <p className="font-semibold">Mixer zakończony</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Dziękujemy za udział — poniżej historia rund.
          </p>
        </div>
      )}

      {/* Lista rund */}
      <div className="flex flex-col gap-3">
        {mixer.rounds.map((round) => (
          <Fragment key={round.roundNumber}>
            <RoundCard
              round={round}
              roundMinutes={mixer.roundMinutes}
              anyLive={mixer.isLive}
            />
            {round.isBreakAfter && (
              <div className="flex items-center gap-3 px-1">
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Coffee className="size-3.5" />
                  Przerwa · {mixer.breakMinutes} min
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </main>
  );
}
