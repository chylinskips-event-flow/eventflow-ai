import { notFound } from "next/navigation";
import { Handshake, Users, Target } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { getPaidOrderCount } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainStatus } from "@/lib/vercel-domains";
import { EventEditForm } from "./form";
import { ChecklistRestoreButton, EventChecklist } from "./event-checklist";
import { computeChecklist } from "@/lib/event-checklist";
import { buildEventApexUrl } from "@/lib/event-url";
import { getOrigin } from "@/lib/request-origin";
import { headers } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { SubdomainStatus } from "./subdomain-status";
import { featureGate } from "@/lib/entitlements";
import { SETTINGS_DEFAULT_TAB, SETTINGS_TAB_KEYS } from "@/lib/organizer-tabs";
import { resolveTabKey } from "@/lib/url-tabs";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId }, { tab }] = await Promise.all([params, searchParams]);
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
    if (domainStatus === "missing") {
      // Domeny nie ma w projekcie Vercel — subdomena celowo nieaktywna (neutralna linia, bez „Ponów”).
      subdomainInitialState = "unknown";
    } else if (domainStatus === null) {
      subdomainInitialState = "error";
    } else if (domainStatus.verified) {
      subdomainInitialState = "active";
    } else {
      subdomainInitialState = "activating";
    }
  }

  const admin = createAdminClient();

  // Liczniki do checklisty startowej — lekkie zapytania count (head), równolegle, bez N+1.
  const countFor = (table: "ticket_types" | "sessions" | "speakers" | "partners") =>
    admin.from(table).select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const [{ count: attendeeCount }, paidOrderCount, ticketTypes, sessions, speakers, partners, origin] = await Promise.all([
    admin
      .from("attendees")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    getPaidOrderCount(eventId),
    countFor("ticket_types"),
    countFor("sessions"),
    countFor("speakers"),
    countFor("partners"),
    headers().then(getOrigin),
  ]);
  const checklist = computeChecklist({
    eventId,
    status: event.status,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location,
    logoUrl: event.logo_url,
    primaryColor: event.primary_color,
    registrationOpen: event.registration_open,
    ticketTypes: ticketTypes.count ?? 0,
    sessions: sessions.count ?? 0,
    speakers: speakers.count ?? 0,
    partners: partners.count ?? 0,
    publicUrl: buildEventApexUrl(event.slug, origin),
  });

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
      initialTab={resolveTabKey(tab, SETTINGS_TAB_KEYS, SETTINGS_DEFAULT_TAB)}
      attendeeCount={attendeeCount ?? 0}
      paidOrderCount={paidOrderCount ?? 0}
      badgesLockedMessage={badgesGate.ok ? null : badgesGate.message}
      checklist={<EventChecklist eventId={eventId} checklist={checklist} />}
      generalExtra={<ChecklistRestoreButton eventId={eventId} />}
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
