"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSection, moveSection } from "./actions";
import type { EventContentSection } from "@/lib/event-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionFormDialog } from "./section-form-dialog";
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

export function SectionCard({
  eventId,
  section,
  isFirst,
  isLast,
}: {
  eventId: string;
  section: EventContentSection;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isMoving, startMoveTransition] = useTransition();
  const [moveError, setMoveError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteSection(eventId, section.id);
      if (result.status === "error") {
        setDeleteError(result.message ?? "Nie udało się usunąć sekcji.");
        return;
      }
      setIsDeleteOpen(false);
    });
  }

  function handleMove(direction: "up" | "down") {
    setMoveError(null);
    startMoveTransition(async () => {
      const result = await moveSection(eventId, section.id, direction);
      if (result.status === "error") {
        setMoveError(result.message ?? "Nie udało się zmienić kolejności.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={isFirst || isMoving}
              onClick={() => handleMove("up")}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={isLast || isMoving}
              onClick={() => handleMove("down")}
            >
              ↓
            </Button>
          </div>
          {moveError && (
            <p className="text-xs text-destructive">{moveError}</p>
          )}
        </div>

        {section.image_url && (
          <img
            src={section.image_url}
            alt={section.title}
            className="h-12 w-12 shrink-0 rounded border object-cover"
          />
        )}

        <div className="flex flex-1 flex-col gap-1">
          <span className="font-medium">{section.title}</span>
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {section.body}
          </span>
        </div>

        <div className="flex shrink-0 gap-2">
          <SectionFormDialog
            eventId={eventId}
            section={section}
            trigger={<Button variant="outline" size="sm">Edytuj</Button>}
          />
          <AlertDialog
            open={isDeleteOpen}
            onOpenChange={(open) => {
              if (isDeleting) return;
              setIsDeleteOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                Usuń
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Usunąć sekcję?</AlertDialogTitle>
                <AlertDialogDescription>
                  Usunięcie sekcji „{section.title}” jest nieodwracalne.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <p className="text-sm text-destructive">{deleteError}</p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Anuluj
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Usuwanie..." : "Usuń"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
