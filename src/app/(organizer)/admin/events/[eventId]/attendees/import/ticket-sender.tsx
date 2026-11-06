"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { sendTickets } from "../guest-actions";

type Progress = { sent: number; failed: number; done: boolean; interrupted: boolean };

export function TicketSender({ eventId, queued }: { eventId: string; queued: number }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const running = progress !== null && !progress.done;

  async function handleSend() {
    let sent = 0;
    const failed: string[] = [];
    setProgress({ sent, failed: 0, done: false, interrupted: false });
    try {
      for (;;) {
        const batch = await sendTickets(eventId, failed);
        sent += batch.sent;
        failed.push(...batch.failed);
        const left = batch.remaining - failed.length;
        // Partia bez żadnego wysłanego maila: awaria dostawcy, nie ma sensu męczyć reszty listy.
        const finished = left <= 0 || batch.sent === 0;
        setProgress({ sent, failed: failed.length, done: finished, interrupted: left > 0 && finished });
        if (finished) return;
      }
    } catch {
      setProgress({ sent, failed: failed.length, done: true, interrupted: true });
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Bilety do wysłania: {queued}</p>
            <p className="text-sm text-muted-foreground">
              Treść maila zmienisz w Komunikatach, szablon „Zatwierdzenie rejestracji”. Samodzielnie zapisani nie
              dostaną drugiego maila.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={queued === 0 || running}>
                <Send className="mr-1.5 size-4" />
                {running ? "Wysyłanie…" : "Wyślij bilety"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Wysłać bilety do {queued} osób?</AlertDialogTitle>
                <AlertDialogDescription>
                  Maile wyjdą od razu do prawdziwych adresów i nie da się ich cofnąć. Nie zamykaj tej strony
                  do końca wysyłki.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anuluj</AlertDialogCancel>
                <AlertDialogAction onClick={handleSend}>Wyślij</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {progress && (
          <p className={`text-sm ${progress.failed || progress.interrupted ? "text-destructive" : "text-green-600"}`} role="status">
            Wysłano: {progress.sent}.
            {progress.failed > 0 && ` Nie udało się: ${progress.failed}.`}
            {progress.interrupted && " Wysyłka przerwana, kliknij ponownie, żeby wysłać resztę."}
            {progress.done && !progress.interrupted && !progress.failed && " Gotowe."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
