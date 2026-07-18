"use client";

import { useState, useTransition } from "react";
import { deleteMyAttendeeData } from "./actions";
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

/**
 * Samoobsługowe usunięcie danych. Sukces akcji kończy się server-side
 * redirectem (?deleted=1), więc do klienta wraca tylko ewentualny błąd.
 */
export function DeleteAccount({ slug }: { slug: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteMyAttendeeData(slug);
      } catch (err) {
        // redirect() rzuca kontrolowany wyjątek (NEXT_REDIRECT) — nie jest
        // błędem, przepuszczamy go dalej. Łapiemy tylko realne porażki.
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
          throw err;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Nie udało się usunąć danych. Spróbuj ponownie.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Usunięcie danych jest nieodwracalne. Skasujemy Twój profil, zdjęcie,
        agendę oraz wszystkie nawiązane kontakty. Aby ponownie uczestniczyć,
        będzie konieczna nowa rejestracja.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-fit" disabled={isPending}>
            Usuń moje dane
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć wszystkie Twoje dane?</AlertDialogTitle>
            <AlertDialogDescription>
              Tej operacji nie można cofnąć. Twój profil i wszystkie powiązane
              dane (agenda, kontakty, sugestie) zostaną trwale usunięte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? "Usuwanie..." : "Usuń trwale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
