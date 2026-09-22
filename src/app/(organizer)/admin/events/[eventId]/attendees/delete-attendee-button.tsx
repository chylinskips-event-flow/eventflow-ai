"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAttendeeAsOrganizer } from "./actions";
import { Button } from "@/components/ui/button";
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

export function DeleteAttendeeButton({
  eventId,
  attendeeId,
  attendeeName,
}: {
  eventId: string;
  attendeeId: string;
  attendeeName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAttendeeAsOrganizer(eventId, attendeeId);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się usunąć uczestnika.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={isPending}>
            Usuń
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć dane uczestnika?</AlertDialogTitle>
            <AlertDialogDescription>
              Trwale usuniesz dane uczestnika {attendeeName} — profil, zdjęcie
              oraz wszystkie powiązane rekordy. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Usuwanie..." : "Usuń trwale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
