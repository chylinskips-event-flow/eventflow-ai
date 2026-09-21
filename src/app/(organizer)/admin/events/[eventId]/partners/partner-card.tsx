"use client";

import { useState, useTransition } from "react";
import { MapPin, QrCode, Building2 } from "lucide-react";
import { deletePartner } from "./actions";
import type { Partner } from "@/lib/partners";
import { partnerTierLabel } from "@/lib/partner-options";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PartnerFormDialog } from "./partner-form-dialog";
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

const TIER_BADGE_CLASSES: Record<string, string> = {
  gold: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  silver: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  bronze:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  partner: "bg-muted text-muted-foreground",
};

export function PartnerCard({
  eventId,
  partner,
  checkinCount,
}: {
  eventId: string;
  partner: Partner;
  checkinCount: number;
}) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const tierLabel = partnerTierLabel(partner.tier);

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deletePartner(eventId, partner.id);
      if (result.status === "error") {
        setDeleteError(result.message ?? "Nie udało się usunąć partnera.");
        return;
      }
      setIsDeleteOpen(false);
    });
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
          {partner.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo w Storage; next/image wymaga konfiguracji domen
            <img
              src={partner.logo_url}
              alt={partner.name}
              className="size-full object-contain"
            />
          ) : (
            <Building2 className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{partner.name}</span>
            {tierLabel && (
              <Badge className={TIER_BADGE_CLASSES[partner.tier ?? ""]}>
                {tierLabel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {partner.booth_location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {partner.booth_location}
              </span>
            )}
            <span>
              {checkinCount}{" "}
              {checkinCount === 1 ? "check-in" : "check-inów"}
            </span>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/admin/events/${eventId}/partners/${partner.id}/booth-qr`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <QrCode className="size-4" /> QR stoiska
          </a>
        </Button>
        <PartnerFormDialog
          eventId={eventId}
          partner={partner}
          trigger={
            <Button variant="outline" size="sm">
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
            <Button variant="outline" size="sm">
              Usuń
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usunąć partnera?</AlertDialogTitle>
              <AlertDialogDescription>
                Usunięcie partnera {partner.name} jest nieodwracalne. Skasuje też
                jego check-iny i zadania przy stoisku.
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
