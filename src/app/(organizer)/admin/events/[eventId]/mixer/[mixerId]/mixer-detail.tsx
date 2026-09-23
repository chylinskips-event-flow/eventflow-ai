"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, Wand2, RotateCcw } from "lucide-react";
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
import { generatePlan, rerollPlan } from "../actions";
import { ParticipantsPanel } from "./participants-panel";
import { ParamsPanel } from "./params-panel";
import { PlanPanel } from "./plan-panel";
import type { MixerRow, MixerParticipant, PlanRound } from "@/lib/mixer/getters";

type AttendeeOption = { id: string; name: string; company: string | null };

type Props = {
  eventId: string;
  mixer: MixerRow;
  participants: MixerParticipant[];
  plan: PlanRound[];
  allAttendees: AttendeeOption[];
  existingAttendeeIds: string[];
};

const STATUS_LABEL: Record<string, string> = {
  draft:     "Szkic",
  generated: "Wygenerowany",
  locked:    "Zablokowany",
};
const STATUS_VARIANT: Record<string, "outline" | "warning" | "success" | "indigo"> = {
  draft:     "outline",
  generated: "indigo",
  locked:    "success",
};

export function MixerDetail({
  eventId,
  mixer,
  participants,
  plan,
  allAttendees,
  existingAttendeeIds,
}: Props) {
  const activeCount = participants.filter((p) => p.status === "active").length;
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [rerollOpen, setRerollOpen] = useState(false);
  const [isGenerating, startGenerate] = useTransition();
  const [isRerolling, startReroll] = useTransition();

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
            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || activeCount < 2}
              title={activeCount < 2 ? "Potrzeba co najmniej 2 aktywnych uczestników" : undefined}
            >
              <Wand2 className="size-4" />
              {isGenerating ? "Generowanie..." : "Generuj plan"}
            </Button>

            {/* Reroll — only when plan exists */}
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
                      Zostanie wygenerowany nowy plan z innym ziarna losowości. Istniejący plan i edycje ice-breakerów zostaną zastąpione.
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
          </div>
        </div>

        {generateError && (
          <p className="mt-2 text-sm text-destructive">{generateError}</p>
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
          />
        </TabsContent>

        <TabsContent value="parametry" className="mt-4">
          <ParamsPanel
            eventId={eventId}
            mixer={mixer}
            activeCount={activeCount}
          />
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <PlanPanel
            eventId={eventId}
            mixerId={mixer.id}
            plan={plan}
            quality={mixer.quality}
            breakAfterRound={mixer.break_after_round}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
