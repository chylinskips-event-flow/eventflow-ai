import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MonitorPlay } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getEventSessionById } from "@/lib/sessions";
import { getOrganizerEngagement } from "@/lib/engagement";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, formatTimeRange } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Button } from "@/components/ui/button";
import { EngagementManager } from "./engagement-manager";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionEngagementPage({
  params,
}: {
  params: Promise<{ eventId: string; sessionId: string }>;
}) {
  const { eventId, sessionId } = await params;
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Link
        href={`/admin/events/${eventId}/engagement`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Wszystkie sesje
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{session.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.starts_at ? `${formatDay(session.starts_at, event.timezone)}${time ? `, ${time}` : ""}` : "Bez daty"}
            {session.room ? ` · ${session.room}` : ""}
          </p>
        </div>
        {token && (
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
        )}
      </div>

      <EngagementManager eventId={eventId} sessionId={sessionId} engagement={engagement} />
    </main>
  );
}
