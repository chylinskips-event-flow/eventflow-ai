import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventAttendees } from "@/lib/attendees";
import { AttendeeList } from "./attendee-list";
import { BadgesButton } from "../badges/badges-button";
import { featureGate } from "@/lib/entitlements";
import { PageShell } from "@/components/page-shell";
import { attendeeTabs } from "@/lib/organizer-tabs";
import { resolveTabKey } from "@/lib/url-tabs";

export default async function EventAttendeesPage({
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

  const badgesGate = await featureGate(event.organization_id, "badges");

  // Sortowanie: najnowsze zgłoszenia na górze (getEventAttendees już sortuje
  // po created_at desc). Bez paginacji na tym etapie — przy większej skali
  // (setki/tysiące uczestników na event) warto rozważyć ją w przyszłości,
  // ale dla MVP to prawdopodobnie nie jest jeszcze problem.
  const attendees = await getEventAttendees(eventId);
  const count = (status: string) => attendees.filter((a) => a.status === status).length;
  const { tabs, defaultTab } = attendeeTabs({
    pending: count("pending"),
    approved: count("approved"),
    rejected: count("rejected"),
  });

  return (
    <PageShell title="Uczestnicy" actions={badgesGate.ok && <BadgesButton eventId={eventId} />}>
      <AttendeeList
        eventId={eventId}
        attendees={attendees}
        tabs={tabs}
        defaultTab={defaultTab}
        initialTab={resolveTabKey(tab, tabs.map((t) => t.key), defaultTab)}
      />
    </PageShell>
  );
}
