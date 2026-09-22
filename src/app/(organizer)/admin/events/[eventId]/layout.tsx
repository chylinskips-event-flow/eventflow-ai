import { ExternalLink } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../../../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventSidebar } from "./event-sidebar";

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

  const [event, supabase] = await Promise.all([
    getOwnEvent(eventId),
    createClient(),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Ciemny sidebar — fixed, zawsze widoczny na md+ */}
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

      {/* Workspace — przesuwa się za sidebar na desktop */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        {/* Workspace header */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
          {/* pl-12 na mobile — robi miejsce na hamburger z EventSidebar */}
          <div className="flex flex-col pl-12 md:pl-0">
            <span className="text-sm font-semibold leading-tight">
              {event?.name ?? "Wydarzenie"}
            </span>
            {event?.status && (
              <Badge
                variant={STATUS_VARIANTS[event.status] ?? "secondary"}
                className={event.status === "live" ? "mt-0.5 animate-pulse" : "mt-0.5"}
              >
                {STATUS_LABELS[event.status] ?? event.status}
              </Badge>
            )}
          </div>
          {event?.slug && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <a
                href={`/e/${event.slug}?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" />
                Podgląd
              </a>
            </Button>
          )}
        </header>

        {/* Treść strony */}
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
