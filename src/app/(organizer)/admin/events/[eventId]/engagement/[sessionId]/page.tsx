import { notFound } from "next/navigation";
import { MonitorPlay } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getEventSessionById } from "@/lib/sessions";
import { getOrganizerEngagement } from "@/lib/engagement";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, formatTimeRange } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { resolveTabKey } from "@/lib/url-tabs";
import { ENGAGEMENT_DEFAULT_TAB, ENGAGEMENT_TAB_KEYS } from "@/lib/organizer-tabs";
import { EngagementManager } from "./engagement-manager";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; sessionId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId, sessionId }, { tab }] = await Promise.all([params, searchParams]);
  const event = await getOwnEvent(eventId);
  if (!event || !UUID.test(sessionId)) notFound();
  const gate = await featureGate(event.organization_id, "live_qa");
  if (!gate.ok) return <FeatureLockedPage title="Q&A i ankiety" message={gate.message} />;

  const session = await getEventSessionById(eventId, sessionId);
  if (!session) notFound();

  const [engagement, tokenRes] = await Promise.all([
    getOrganizerEngagement(sessionId),
    createAdminClient().from("sessions").select("qa_present_token").eq("id", sessionId).maybeSingle(),
  ]);
  const token = tokenRes.data?.qa_present_token as string | undefined;
  const time = formatTimeRange(session.starts_at, session.ends_at, event.timezone);
  const projectorAvailable = event.status === "published" || event.status === "live";

  return (
    <PageShell
      back={{ href: `/admin/events/${eventId}/engagement`, label: "Wszystkie sesje" }}
      title={session.title}
      description={
        <>
          {session.starts_at ? `${formatDay(session.starts_at, event.timezone)}${time ? `, ${time}` : ""}` : "Bez daty"}
          {session.room ? ` · ${session.room}` : ""}
        </>
      }
      actions={
        token && (
          <div className="flex flex-col items-end gap-1">
            {projectorAvailable ? (
              <Button asChild variant="outline">
                <a href={`/qa/${token}`} target="_blank" rel="noopener noreferrer">
                  <MonitorPlay className="size-4" />
                  Ekran rzutnika
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <MonitorPlay className="size-4" />
                Ekran rzutnika
              </Button>
            )}
            {!projectorAvailable && (
              <span className="text-xs text-muted-foreground">Dostępny po opublikowaniu wydarzenia</span>
            )}
          </div>
        )
      }
    >
      <EngagementManager
        eventId={eventId}
        sessionId={sessionId}
        engagement={engagement}
        initialTab={resolveTabKey(tab, ENGAGEMENT_TAB_KEYS, ENGAGEMENT_DEFAULT_TAB)}
      />
    </PageShell>
  );
}
