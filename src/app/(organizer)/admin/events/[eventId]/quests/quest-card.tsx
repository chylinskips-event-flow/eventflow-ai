"use client";

import { useState, useTransition } from "react";
import { toggleQuestActive, deleteQuest } from "./actions";
import { QuestFormDialog, type QuestForEdit } from "./quest-form-dialog";
import type { Partner } from "@/lib/partners";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  booth_visit:          "Odwiedziny stoiska",
  booth_quiz:           "Quiz przy stoisku",
  booth_password:       "Hasło przy stoisku",
  networking_contacts:  "Networking",
  profile_complete:     "Profil",
};

const TYPE_COLORS: Record<string, string> = {
  booth_visit:         "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  booth_quiz:          "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  booth_password:      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  networking_contacts: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  profile_complete:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

export function QuestCard({
  eventId,
  quest,
  partners,
  partnerName,
}: {
  eventId: string;
  quest: QuestForEdit;
  partners: Partner[];
  partnerName: string | null;
}) {
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleToggle(checked: boolean) {
    startToggle(async () => {
      await toggleQuestActive(eventId, quest.id, checked);
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteQuest(eventId, quest.id);
      if (result.status === "error") {
        setDeleteError(result.message ?? "Nie udało się usunąć questa.");
        return;
      }
      setIsDeleteOpen(false);
    });
  }

  return (
    <Card className={cn(!quest.is_active && "opacity-60")}>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate">{quest.title}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                TYPE_COLORS[quest.type] ?? "bg-muted text-muted-foreground",
              )}
            >
              {TYPE_LABELS[quest.type] ?? quest.type}
            </span>
            {quest.points_value !== null && quest.points_value !== undefined && (
              <span className="text-xs font-semibold text-primary shrink-0">
                {quest.points_value} pkt
              </span>
            )}
          </div>
          {quest.description && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {quest.description}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {partnerName && <span>Partner: {partnerName}</span>}
            {quest.target_value != null && (
              <span>Cel: {quest.target_value} kontaktów</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleToggle(!quest.is_active)}
            disabled={isToggling}
            className={cn(quest.is_active ? "text-green-700 dark:text-green-400" : "text-muted-foreground")}
          >
            {quest.is_active ? "Aktywny" : "Nieaktywny"}
          </Button>
          <QuestFormDialog
            eventId={eventId}
            quest={quest}
            partners={partners}
            trigger={
              <Button variant="outline" size="sm" disabled={isDeleting}>
                Edytuj
              </Button>
            }
          />
          <AlertDialog
            open={isDeleteOpen}
            onOpenChange={(open) => {
              if (isDeleting) return;
              setIsDeleteOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                Usuń
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Usunąć quest?</AlertDialogTitle>
                <AlertDialogDescription>
                  Usunięcie questa „{quest.title}" jest nieodwracalne. Skasuje
                  też historię jego zaliczenia przez uczestników.
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
