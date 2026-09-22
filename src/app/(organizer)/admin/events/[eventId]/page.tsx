import { notFound } from "next/navigation";
import { Handshake, Users, Target } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventEditForm } from "./form";
import { Card, CardContent } from "@/components/ui/card";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  let stats: {
    totalCheckins: number;
    activePlayers: number;
    completedQuests: number;
  } | null = null;

  if (event.gamification_enabled) {
    const admin = createAdminClient();
    const [
      { count: checkinsCount },
      { count: activePlayersCount },
      { count: completedQuestsCount },
    ] = await Promise.all([
      admin
        .from("checkins")
        .select("id, partners!inner(event_id)", { count: "exact", head: true })
        .eq("partners.event_id" as never, eventId),
      admin
        .from("attendees")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "approved")
        .gt("points", 0),
      admin
        .from("quest_completions")
        .select("id, quests!inner(event_id)", { count: "exact", head: true })
        .eq("quests.event_id" as never, eventId),
    ]);

    stats = {
      totalCheckins: checkinsCount ?? 0,
      activePlayers: activePlayersCount ?? 0,
      completedQuests: completedQuestsCount ?? 0,
    };
  }

  return (
    <div className="flex flex-col gap-6">
      {stats && (
        <div className="mx-auto w-full max-w-2xl px-6 pt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Grywalizacja
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
                <Handshake className="mb-1 size-5 text-primary" />
                <span className="text-2xl font-bold text-primary">{stats.totalCheckins}</span>
                <span className="text-xs text-muted-foreground">Wizyty u partnerów</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
                <Users className="mb-1 size-5 text-primary" />
                <span className="text-2xl font-bold text-primary">{stats.activePlayers}</span>
                <span className="text-xs text-muted-foreground">Aktywnych graczy</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
                <Target className="mb-1 size-5 text-primary" />
                <span className="text-2xl font-bold text-primary">{stats.completedQuests}</span>
                <span className="text-xs text-muted-foreground">Ukończonych questów</span>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <EventEditForm event={event} />
    </div>
  );
}
