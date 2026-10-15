"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  Download,
  MapPin,
  MoreHorizontal,
  Pencil,
  QrCode,
  Trash2,
  UserCog,
} from "lucide-react";
import { deletePartner } from "./actions";
import type { Partner } from "@/lib/partners";
import type { PortalAccessSummary } from "@/lib/partner-portal-core";
import { pluralizePl } from "@/lib/format";
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TIER_BADGE_CLASSES: Record<string, string> = {
  gold: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  silver: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  bronze:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  partner: "bg-muted text-muted-foreground",
};

type PortalStatus =
  | { kind: "pending"; count: number }
  | { kind: PortalAccessSummary };

const STATUS_BADGE: Record<
  PortalAccessSummary,
  { label: string; variant: "success" | "indigo" | "secondary" }
> = {
  active: { label: "Aktywny", variant: "success" },
  invited: { label: "Zaproszony", variant: "indigo" },
  none: { label: "Brak dostępu", variant: "secondary" },
};

// Oczekujące akceptacje mają pierwszeństwo — to jedyny stan wymagający akcji organizatora.
function portalStatus(
  pendingReviews: number,
  access: PortalAccessSummary,
): PortalStatus {
  return pendingReviews > 0
    ? { kind: "pending", count: pendingReviews }
    : { kind: access };
}

export function PartnerCard({
  eventId,
  partner,
  checkinCount,
  leadCount,
  legacyLeadCount,
  leadsV2,
  pendingReviews,
  portalAccess,
}: {
  eventId: string;
  partner: Partner;
  checkinCount: number;
  leadCount: number;
  /** Faza B włączona: leady ze starego checkboxa (archiwum) — tylko eksport w menu „⋯”. */
  legacyLeadCount: number;
  leadsV2: boolean;
  pendingReviews: number;
  portalAccess: PortalAccessSummary;
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

  const status = portalStatus(pendingReviews, portalAccess);
  const panelHref = `/admin/events/${eventId}/partners/${partner.id}`;

  return (
    <Card>
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 py-4">
        <div className="col-start-1 row-start-1 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
          {partner.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo w Storage; next/image wymaga konfiguracji domen
            <img
              src={partner.logo_url}
              alt={partner.name}
              className="size-full object-contain"
            />
          ) : (
            <Building2 className="size-5 text-muted-foreground" />
          )}
        </div>

        <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium" title={partner.name}>
              {partner.name}
            </span>
            {tierLabel && (
              <Badge className={TIER_BADGE_CLASSES[partner.tier ?? ""]}>
                {tierLabel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {checkinCount} {pluralizePl(checkinCount, ["wizyta", "wizyty", "wizyt"])}
            </Badge>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {leadCount} {pluralizePl(leadCount, ["lead", "leady", "leadów"])}
            </Badge>
            {partner.booth_location && (
              <Badge
                variant="outline"
                className="max-w-full font-normal text-muted-foreground"
              >
                <MapPin />
                <span className="truncate">{partner.booth_location}</span>
              </Badge>
            )}
          </div>
          <div>
            {status.kind === "pending" ? (
              <Badge asChild variant="warning">
                <Link href={panelHref} className="hover:underline">
                  <AlertCircle /> Do akceptacji ({status.count})
                </Link>
              </Badge>
            ) : (
              <Badge variant={STATUS_BADGE[status.kind].variant}>
                {STATUS_BADGE[status.kind].label}
              </Badge>
            )}
          </div>
        </div>

        <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={panelHref}>
              <UserCog /> Panel partnera
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a
              href={`/admin/events/${eventId}/partners/${partner.id}/booth-qr`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <QrCode /> QR stoiska
            </a>
          </Button>
          <PartnerFormDialog
            eventId={eventId}
            partner={partner}
            trigger={
              <Button variant="ghost" size="sm">
                <Pencil /> Edytuj
              </Button>
            }
          />
        </div>

        <div className="col-start-3 row-start-1">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Więcej akcji: ${partner.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {/* Stary eksport (zgody z check-inu). Przy Fazie B nowe leady pobiera partner
                  w swoim panelu; tu zostaje archiwum, jeśli istnieje. */}
              {(leadsV2 ? legacyLeadCount : leadCount) > 0 && (
                <>
                  <DropdownMenuItem asChild>
                    <a
                      href={`/admin/events/${eventId}/partners/${partner.id}/leads.csv`}
                      download
                    >
                      <Download />
                      {leadsV2 ? `Leady CSV — archiwum (${legacyLeadCount})` : "Leady CSV"}
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDeleteError(null);
                  setIsDeleteOpen(true);
                }}
              >
                <Trash2 /> Usuń
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AlertDialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            if (isDeleting) return;
            setIsDeleteOpen(open);
          }}
        >
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
