import { notFound } from "next/navigation";
import { Handshake, Users, Target } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { getPaidOrderCount } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainStatus } from "@/lib/vercel-domains";
import { EventEditForm } from "./form";
import { Card, CardContent } from "@/components/ui/card";
import { SubdomainStatus } from "./subdomain-status";
import { featureGate } from "@/lib/entitlements";

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

  const isPublished = event.status === "published" || event.status === "live";
  const [subdomainsGate, badgesGate] = await Promise.all([
    featureGate(event.organization_id, "subdomains"),
    featureGate(event.organization_id, "badges"),
  ]);
  const rootDomain = process.env.ROOT_DOMAIN ?? "eventro.pl";
  let subdomainInitialState: "active" | "activating" | "error" | "unknown" = "unknown";

  if (isPublished && subdomainsGate.ok && process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID) {
    const domainStatus = await getDomainStatus(`${event.slug}.${rootDomain}`);
    if (domainStatus === null) {
      subdomainInitialState = "error";
    } else if (domainStatus.verified) {
      subdomainInitialState = "active";
    } else {
      subdomainInitialState = "activating";
    }
  }

  const admin = createAdminClient();

  const [{ count: attendeeCount }, paidOrderCount] = await Promise.all([
    admin
      .from("attendees")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    getPaidOrderCount(eventId),
  ]);

  let stats: {
    totalCheckins: number;
    activePlayers: number;
    completedQuests: number;
  } | null = null;

  if (event.gamification_enabled) {
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
    <EventEditForm
      event={event}
      attendeeCount={attendeeCount ?? 0}
      paidOrderCount={paidOrderCount ?? 0}
      badgesLockedMessage={badgesGate.ok ? null : badgesGate.message}
      subdomainStatus={
        isPublished && !subdomainsGate.ok ? (
          <p className="text-sm text-muted-foreground">{subdomainsGate.message}</p>
        ) : isPublished ? (
          <SubdomainStatus
            eventId={eventId}
            slug={event.slug}
            initialState={subdomainInitialState}
          />
        ) : null
      }
      summary={
        stats ? (
          <div>
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
        ) : null
      }
    />
  );
}
