"use client";

import { useTransition } from "react";
import { deleteTemplate } from "./actions";
import type { MessageTemplateType } from "@/lib/message-templates";
import { Button } from "@/components/ui/button";
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

export function DeleteTemplateButton({
  eventId,
  templateType,
}: {
  eventId: string;
  templateType: MessageTemplateType;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      await deleteTemplate(eventId, templateType);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          Przywróć domyślny
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Przywrócić domyślny szablon?</AlertDialogTitle>
          <AlertDialogDescription>
            Własna konfiguracja tego szablonu zostanie usunięta. Komunikaty
            będą wysyłane z treścią domyślną.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleRestore}
            disabled={isPending}
          >
            {isPending ? "Przywracanie..." : "Przywróć domyślny"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
