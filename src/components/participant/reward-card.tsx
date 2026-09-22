"use client";

import { CheckCircle2, Gift } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RewardCardProps = {
  id: string;
  name: string;
  description: string | null;
  pointsRequired: number;
  stock: number | null;
  attendeePoints: number;
  redeemed: boolean;
};

export function RewardCard({
  name,
  description,
  pointsRequired,
  stock,
  attendeePoints,
  redeemed,
}: RewardCardProps) {
  const outOfStock = stock !== null && stock <= 0;
  const canAfford = !outOfStock && !redeemed && attendeePoints >= pointsRequired;
  const missing = pointsRequired - attendeePoints;

  const dimmed = outOfStock;

  const inner = (
    <Card className={cn(
      "transition-colors",
      dimmed && "opacity-60",
      canAfford && "border-aqua/50",
      redeemed && "border-green-500/40 bg-green-50/40 dark:bg-green-900/10",
    )}>
      <CardContent className="flex items-start gap-4 py-4">
        {/* Image placeholder */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Gift className="size-6 text-muted-foreground" />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          <span className="font-medium leading-snug">{name}</span>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
              {pointsRequired} pkt
            </span>
            {stock !== null && !outOfStock && (
              <span className="text-xs text-muted-foreground">
                {stock} szt.
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 self-center">
          {redeemed ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-4" />
              Odebrano
            </span>
          ) : outOfStock ? (
            <span className="text-xs text-muted-foreground">Wyczerpane</span>
          ) : canAfford ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-aqua">
              <CheckCircle2 className="size-4" />
              Stać Cię!
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Brakuje {missing} pkt
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (canAfford) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button className="w-full text-left">{inner}</button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{name}</AlertDialogTitle>
            <AlertDialogDescription>
              Masz wystarczającą liczbę punktów, aby odebrać tę nagrodę.
              {description && ` ${description}`}
              {" "}Nagrodę odbierasz u organizatora — pokaż im swój profil lub kod QR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Rozumiem</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return inner;
}
