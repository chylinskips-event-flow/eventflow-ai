"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, Wand2, RotateCcw, Play, ChevronRight, Square, Info, ExternalLink, Lock, Unlock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { generatePlan, rerollPlan, startMixer, nextRound, resetLive, lockMixer, unlockMixer } from "../actions";
import { ParticipantsPanel } from "./participants-panel";
import { ParamsPanel } from "./params-panel";
import { PlanPanel } from "./plan-panel";
import type { MixerRow, MixerParticipant, MixerRound, PlanRound } from "@/lib/mixer/getters";

type AttendeeOption = { id: string; name: string; company: string | null };

type Props = {
  eventId: string;
  mixer: MixerRow;
  participants: MixerParticipant[];
  plan: PlanRound[];
  rounds: MixerRound[];
  allAttendees: AttendeeOption[];
  existingAttendeeIds: string[];
};

const STATUS_LABEL: Record<string, string> = {
  draft:     "Szkic",
  generated: "Wygenerowany",
  locked:    "Zablokowany",
  running:   "Aktywny",
  finished:  "Zakończony",
};
const STATUS_VARIANT: Record<string, "outline" | "warning" | "success" | "indigo"> = {
  draft:     "outline",
  generated: "indigo",
  locked:    "success",
  running:   "warning",
  finished:  "outline",
};

// ── Live control panel (sterowanie u organizatora) ────────────────────────────

function LiveControlPanel({
  mixer,
  rounds,
  eventId,
}: {
  mixer: MixerRow;
  rounds: MixerRound[];
  eventId: string;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeRound = rounds.find((r) => r.status === "active");
  const totalRounds = rounds.length;
  const isLastRound = activeRound?.round_number === totalRounds;

  function handleStart() {
    startTransition(async () => {
      await startMixer(mixer.id, eventId);
      setStartOpen(false);
    });
  }

  function handleNext() {
    startTransition(async () => {
      await nextRound(mixer.id, eventId);
    });
  }

  function handleReset() {
    startTransition(async () => {
      await resetLive(mixer.id, eventId);
      setResetOpen(false);
    });
  }

  // Start button — plan wygenerowany, mixer jeszcze nie uruchomiony
  if (
    (mixer.status === "generated" || mixer.status === "locked") &&
    rounds.length > 0
  ) {
    return (
      <AlertDialog open={startOpen} onOpenChange={(o) => { if (!isPending) setStartOpen(o); }}>
        <AlertDialogTrigger asChild>
          <Button variant="default">
            <Play className="size-4" />
            Start mixera
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uruchomić mixer?</AlertDialogTitle>
            <AlertDialogDescription>
              Runda 1 zostanie uruchomiona natychmiast. Edycja planu, uczestników i parametrów zostanie zablokowana na czas biegu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
            <Button onClick={handleStart} disabled={isPending}>
              {isPending ? "Uruchamianie..." : "Uruchom"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Running — Następna runda / Zakończ (z dialogiem) + Reset
  if (mixer.status === "running") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Runda {activeRound?.round_number ?? "?"}&nbsp;/&nbsp;{totalRounds}
        </span>

        {isLastRound ? (
          // Zakończ — destructive z potwierdzeniem
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isPending}>
                <Square className="size-4" />
                Zakończ mixer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zakończyć mixer?</AlertDialogTitle>
                <AlertDialogDescription>
                  Runda {activeRound?.round_number} zostanie oznaczona jako zakończona i mixer przejdzie do stanu „Zakończony". Możesz go zresetować do stanu gotowości przyciskiem Resetuj.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
                <Button variant="destructive" onClick={handleNext} disabled={isPending}>
                  {isPending ? "Kończenie..." : "Zakończ"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          // Następna runda — bez potwierdzenia
          <Button onClick={handleNext} disabled={isPending}>
            <ChevronRight className="size-4" />
            {isPending ? "..." : "Następna runda"}
          </Button>
        )}

        <AlertDialog open={resetOpen} onOpenChange={(o) => { if (!isPending) setResetOpen(o); }}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" title="Zresetuj do stanu gotowości">
              <RotateCcw className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zresetować mixer?</AlertDialogTitle>
              <AlertDialogDescription>
                Wszystkie rundy wrócą do stanu pending, mixer będzie ponownie gotowy do uruchomienia. Plan pozostaje bez zmian.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
              <Button variant="destructive" onClick={handleReset} disabled={isPending}>
                {isPending ? "Resetowanie..." : "Resetuj"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Finished — tylko Reset
  if (mixer.status === "finished") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Mixer zakończony</span>

        <AlertDialog open={resetOpen} onOpenChange={(o) => { if (!isPending) setResetOpen(o); }}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <RotateCcw className="size-4" />
              Resetuj
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zresetować mixer?</AlertDialogTitle>
              <AlertDialogDescription>
                Mixer wróci do stanu gotowości. Plan pozostaje bez zmian.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
              <Button variant="destructive" onClick={handleReset} disabled={isPending}>
                {isPending ? "Resetowanie..." : "Resetuj"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return null;
}

// ── MixerDetail ───────────────────────────────────────────────────────────────

export function MixerDetail({
  eventId,
  mixer,
  participants,
  plan,
  rounds,
  allAttendees,
  existingAttendeeIds,
}: Props) {
  const activeCount = participants.filter((p) => p.status === "active").length;
  const isLive = mixer.status === "running" || mixer.status === "finished";

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [rerollOpen, setRerollOpen] = useState(false);
  const [isGenerating, startGenerate] = useTransition();
  const [isRerolling, startReroll] = useTransition();
  const [isLocking, startLockTransition] = useTransition();
  const [isUnlocking, startUnlockTransition] = useTransition();

  function handleGenerate() {
    setGenerateError(null);
    startGenerate(async () => {
      const result = await generatePlan(mixer.id, eventId);
      if (result.status === "error") setGenerateError(result.message ?? "Błąd generacji.");
    });
  }

  function handleReroll() {
    startReroll(async () => {
      await rerollPlan(mixer.id, eventId);
      setRerollOpen(false);
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      {/* Back + header */}
      <div>
        <Link
          href={`/admin/events/${eventId}/mixer`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          Wszystkie mixery
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{mixer.name}</h1>
            <Badge variant={STATUS_VARIANT[mixer.status] ?? "outline"}>
              {STATUS_LABEL[mixer.status] ?? mixer.status}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Generuj + Przelicz — ukryte gdy mixer aktywny */}
            {!isLive && (
              <>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || activeCount < 2}
                  title={activeCount < 2 ? "Potrzeba co najmniej 2 aktywnych uczestników" : undefined}
                >
                  <Wand2 className="size-4" />
                  {isGenerating ? "Generowanie..." : "Generuj plan"}
                </Button>

                {mixer.status !== "draft" && (
                  <AlertDialog open={rerollOpen} onOpenChange={(o) => { if (!isRerolling) setRerollOpen(o); }}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" title="Wygeneruj nowy plan z innym ziarnem">
                        <RotateCcw className="size-4" />
                        Przelicz
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Przelicz plan?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Zostanie wygenerowany nowy plan z innym ziarnem losowości. Istniejący plan i edycje ice-breakerów zostaną zastąpione.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRerolling}>Anuluj</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleReroll} disabled={isRerolling}>
                          {isRerolling ? "Przeliczanie..." : "Przelicz ponownie"}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}

            {/* Lock — visible gdy generated */}
            {mixer.status === "generated" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Lock className="size-4" />
                    Zablokuj
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Zablokować plan?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Zablokowany plan nie może być edytowany — żadnych zamian uczestników, parametrów ani swapów. Możesz go odblokować w dowolnym momencie.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anuluj</AlertDialogCancel>
                    <Button
                      onClick={() => startLockTransition(async () => { await lockMixer(eventId, mixer.id); })}
                      disabled={isLocking}
                    >
                      {isLocking ? "Blokuję..." : "Zablokuj"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Unlock — visible gdy locked */}
            {mixer.status === "locked" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startUnlockTransition(async () => { await unlockMixer(eventId, mixer.id); })}
                disabled={isUnlocking}
              >
                <Unlock className="size-4" />
                {isUnlocking ? "Odblokowuję..." : "Odblokuj"}
              </Button>
            )}

            {/* Rzutnik — widoczny gdy plan wygenerowany lub mixer aktywny */}
            {mixer.present_token && mixer.status !== "draft" && (
              <Button variant="outline" size="sm" asChild>
                <a href={`/p/${mixer.present_token}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Rzutnik
                </a>
              </Button>
            )}

            {/* Live control panel */}
            <LiveControlPanel mixer={mixer} rounds={rounds} eventId={eventId} />
          </div>
        </div>

        {generateError && (
          <p className="mt-2 text-sm text-destructive">{generateError}</p>
        )}

        {/* Baner blokady */}
        {mixer.status === "running" && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" />
            Mixer w trakcie biegu — edycja planu, uczestników i parametrów jest zablokowana.
          </div>
        )}
        {mixer.status === "finished" && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" />
            Mixer zakończony — edycja jest zablokowana. Użyj „Resetuj" aby wrócić do stanu gotowości.
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="uczestnicy">
        <TabsList>
          <TabsTrigger value="uczestnicy">
            Uczestnicy ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="parametry">Parametry</TabsTrigger>
          <TabsTrigger value="plan" disabled={mixer.status === "draft"}>
            Plan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uczestnicy" className="mt-4">
          <ParticipantsPanel
            eventId={eventId}
            mixerId={mixer.id}
            participants={participants}
            allAttendees={allAttendees}
            existingAttendeeIds={existingAttendeeIds}
            isLive={isLive}
          />
        </TabsContent>

        <TabsContent value="parametry" className="mt-4">
          <ParamsPanel
            eventId={eventId}
            mixer={mixer}
            activeCount={activeCount}
            isLive={isLive}
          />
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <PlanPanel
            eventId={eventId}
            mixerId={mixer.id}
            plan={plan}
            quality={mixer.quality}
            breakAfterRound={mixer.break_after_round}
            mixerStatus={mixer.status}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
