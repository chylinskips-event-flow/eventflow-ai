import { ExternalLink } from "lucide-react";
import { headers } from "next/headers";
import { getOwnEvent } from "@/lib/events";
import { getOrigin } from "@/lib/request-origin";
import { buildEventApexUrl } from "@/lib/event-url";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../../../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventSidebar } from "./event-sidebar";
import { ShareEventDialog } from "@/components/share-event-dialog";

const STATUS_LABELS: Record<string, string> = {
  draft:     "Szkic",
  published: "Opublikowany",
  live:      "Na żywo",
  completed: "Zakończony",
  archived:  "Zarchiwizowany",
};

const STATUS_VARIANTS: Record<string, "secondary" | "success" | "indigo"> = {
  draft:     "secondary",
  published: "success",
  live:      "indigo",
  completed: "secondary",
  archived:  "secondary",
};

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const [event, supabase, origin] = await Promise.all([
    getOwnEvent(eventId),
    createClient(),
    headers().then(getOrigin),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Ciemny sidebar — fixed, zawsze widoczny na md+ */}
      {/* Na wydruku (logistyka stoisk, QR) tylko treść strony. */}
      <div className="print:hidden">
        <EventSidebar
          eventId={eventId}
          gamificationEnabled={event?.gamification_enabled ?? false}
          hasLottery={
            (event?.gamification_enabled ?? false) &&
            event?.lottery_points_per_ticket != null
          }
          userEmail={user?.email ?? null}
          signOut={signOut}
        />
      </div>

      {/* Workspace — przesuwa się za sidebar na desktop.
          overflow-x-clip (nie hidden): hidden tworzy kontener przewijania i psuje
          sticky (nagłówek, sub-nav Ustawień). min-w-0 — clip nie zeruje min-width elementu flex. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip md:pl-64 print:pl-0">
        {/* Workspace header — jeden rząd o stałej wysokości h-14 (56 px): nazwa + status w jednej
            linii, przyciski obok (na telefonie same ikony). Recepcja przykleja swój panel pod nim (top-14). */}
        <header data-workspace-header className="print:hidden sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background px-4 md:px-6">
          {/* pl-12 na mobile — robi miejsce na hamburger z EventSidebar */}
          <div className="flex min-w-0 items-center gap-2 pl-12 md:pl-0">
            <span className="truncate text-sm font-semibold leading-tight" title={event?.name ?? undefined}>
              {event?.name ?? "Wydarzenie"}
            </span>
            {event?.status && (
              <Badge
                variant={STATUS_VARIANTS[event.status] ?? "secondary"}
                className={event.status === "live" ? "animate-pulse" : undefined}
              >
                {STATUS_LABELS[event.status] ?? event.status}
              </Badge>
            )}
          </div>
          {event?.slug && (
            <div className="flex shrink-0 items-center gap-2">
              <ShareEventDialog
                compactOnMobile
                url={buildEventApexUrl(event.slug, origin)}
                eventName={event.name ?? ""}
                slug={event.slug}
                disabled={event.status === "draft"}
              />
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/e/${event.slug}?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Podgląd strony wydarzenia"
                >
                  <ExternalLink className="size-4" />
                  <span className="max-sm:sr-only">Podgląd</span>
                </a>
              </Button>
            </div>
          )}
        </header>

        {/* Treść strony */}
        <div className="flex-1 px-4 sm:px-0">
          {children}
        </div>
      </div>
    </div>
  );
}
