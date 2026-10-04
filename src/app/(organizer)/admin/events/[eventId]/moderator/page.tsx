import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getEventSessions } from "@/lib/sessions";
import { getEventAlerts, getModeratorLinks, getModeratorNotes } from "@/lib/moderator";
import { collectRooms } from "@/lib/moderator-core";
import { getOrigin } from "@/lib/request-origin";
import { formatDay, formatTimeRange } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { ModeratorAdmin } from "./moderator-admin";

export default async function ModeratorAdminPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const gate = await featureGate(event.organization_id, "live_qa");
  if (!gate.ok) return <FeatureLockedPage title="Prowadzący" message={gate.message} />;

  const [sessions, links, alerts, notes] = await Promise.all([
    getEventSessions(eventId),
    getModeratorLinks(eventId),
    getEventAlerts(eventId),
    getModeratorNotes(eventId),
  ]);
  const origin = getOrigin(await headers());
  const rooms = collectRooms(event.room_names, sessions.map((s) => s.room));
  const labelById = new Map(links.map((l) => [l.id, l.label]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Prowadzący</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Panel dla prowadzących i moderatorów sal: agenda z prelegentami, Q&amp;A i ankiety,
          komunikaty do ogłoszenia, scenariusz oraz sponsorzy i partnerzy. Każdy prowadzący
          dostaje własny link — bez zakładania konta.
        </p>
      </div>

      <ModeratorAdmin
        eventId={eventId}
        rooms={rooms}
        links={links.map((l) => ({
          id: l.id,
          label: l.label,
          room: l.room,
          revoked: !!l.revoked_at,
          url: `${origin}/mod/${l.token}`,
        }))}
        alerts={alerts.map((a) => ({
          id: a.id,
          content: a.content,
          room: a.room,
          is_important: a.is_important,
          announced_at: a.announced_at,
          announced_by: a.announced_via ? labelById.get(a.announced_via) ?? null : null,
        }))}
        script={notes.script}
        sessions={sessions.map((s) => {
          const time = formatTimeRange(s.starts_at, s.ends_at, event.timezone);
          return {
            id: s.id,
            title: s.title,
            meta: [
              s.starts_at ? `${formatDay(s.starts_at, event.timezone)}${time ? `, ${time}` : ""}` : "Bez daty",
              s.room,
            ]
              .filter(Boolean)
              .join(" · "),
            note: notes.bySession[s.id] ?? "",
          };
        })}
        timezone={event.timezone}
      />
    </main>
  );
}
