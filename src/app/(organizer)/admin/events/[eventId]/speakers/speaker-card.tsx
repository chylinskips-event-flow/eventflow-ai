"use client";

import { useState, useTransition } from "react";
import { deleteSpeaker } from "./actions";
import type { Speaker } from "@/lib/speakers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SpeakerFormDialog } from "./speaker-form-dialog";
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

export function SpeakerCard({
  eventId,
  speaker,
}: {
  eventId: string;
  speaker: Speaker;
}) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fullName = [speaker.first_name, speaker.last_name]
    .filter(Boolean)
    .join(" ");
  const initials = [speaker.first_name?.[0], speaker.last_name?.[0]]
    .filter(Boolean)
    .join("");

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteSpeaker(eventId, speaker.id);
      if (result.status === "error") {
        setDeleteError(result.message ?? "Nie udało się usunąć prelegenta.");
        return;
      }
      setIsDeleteOpen(false);
    });
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <Avatar size="lg">
          {speaker.photo_url && (
            <AvatarImage src={speaker.photo_url} alt={fullName} />
          )}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">{fullName}</span>
          {speaker.company && (
            <span className="text-sm text-muted-foreground">
              {speaker.company}
            </span>
          )}
        </div>
        <SpeakerFormDialog
          eventId={eventId}
          speaker={speaker}
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
              <AlertDialogTitle>Usunąć prelegenta?</AlertDialogTitle>
              <AlertDialogDescription>
                Usunięcie prelegenta {fullName} jest nieodwracalne.
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
      </CardContent>
    </Card>
  );
}
