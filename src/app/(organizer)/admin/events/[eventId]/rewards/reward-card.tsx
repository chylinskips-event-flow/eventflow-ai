"use client";

import { useState, useTransition } from "react";
import { deleteReward } from "./actions";
import { RewardFormDialog, type RewardForEdit } from "./reward-form-dialog";
import { RewardImageUpload } from "./reward-image-upload";
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

export function RewardCard({
  eventId,
  reward,
  redemptionCount,
}: {
  eventId: string;
  reward: RewardForEdit;
  redemptionCount: number;
}) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteReward(eventId, reward.id);
      if (result.status === "error") {
        setDeleteError(result.message ?? "Nie udało się usunąć nagrody.");
        return;
      }
      setIsDeleteOpen(false);
    });
  }

  const stockLabel =
    reward.stock === null ? "Nieograniczony" : `${reward.stock} szt.`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-0 py-4">
        {/* Główny rząd: miniatura + treść + przyciski */}
        <div className="flex items-center gap-4">
          {reward.image_url && (
            <img
              src={reward.image_url}
              alt={reward.name}
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          )}

          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <span className="font-medium">{reward.name}</span>
            {reward.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {reward.description}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{reward.points_required} pkt</span>
              <span>Magazyn: {stockLabel}</span>
              <span>Wydano: {redemptionCount}</span>
              {reward.badge_label && (
                <span className="font-medium text-primary">{reward.badge_label}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <RewardFormDialog
              eventId={eventId}
              reward={reward}
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
                  <AlertDialogTitle>Usunąć nagrodę?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Usunięcie nagrody „{reward.name}" jest nieodwracalne. Skasuje też
                    historię jej wydań.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <p className="text-sm text-destructive">{deleteError}</p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
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
        </div>

        {/* Upload zdjęcia — zawsze widoczny (reward już istnieje) */}
        <RewardImageUpload eventId={eventId} rewardId={reward.id} />
      </CardContent>
    </Card>
  );
}
