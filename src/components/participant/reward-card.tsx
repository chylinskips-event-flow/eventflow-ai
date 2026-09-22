"use client";

import { CheckCircle2, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RewardCardProps = {
  id: string;
  name: string;
  description: string | null;
  pointsRequired: number;
  stock: number | null;
  attendeePoints: number;
  redeemed: boolean;
  imageUrl?: string | null;
  badgeLabel?: string | null;
};

export function RewardCard({
  name,
  description,
  pointsRequired,
  stock,
  attendeePoints,
  redeemed,
  imageUrl,
  badgeLabel,
}: RewardCardProps) {
  const outOfStock = stock !== null && stock <= 0;
  const canAfford = !outOfStock && !redeemed && attendeePoints >= pointsRequired;
  const missing = pointsRequired - attendeePoints;

  const inner = (
    <Card className={cn(
      "overflow-hidden transition-colors",
      outOfStock && "opacity-60",
      canAfford && "border-aqua/50",
      redeemed && "border-green-500/40 bg-green-50/40 dark:bg-green-900/10",
    )}>
      {/* Baner — obraz lub fallback Gift */}
      <div className="flex h-44 w-full items-center justify-center bg-muted/30">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="max-h-full max-w-full object-contain p-3"
          />
        ) : (
          <Gift className="size-10 text-muted-foreground/50" />
        )}
      </div>

      {/* Treść pod banerem */}
      <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
        {/* Nazwa + odznaka */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold leading-snug">{name}</span>
          {badgeLabel && (
            <Badge variant="secondary">{badgeLabel}</Badge>
          )}
        </div>

        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        )}

        {/* Punkty + stan */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
            {pointsRequired} pkt
          </span>

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
              Wymień punkty
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Brakuje {missing} pkt
            </span>
          )}
        </div>
      </div>
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
