import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { countTicketQueue } from "@/lib/guest-import";
import { PageShell } from "@/components/page-shell";
import { GuestImportForm } from "./guest-import-form";
import { TicketSender } from "./ticket-sender";

export default async function GuestImportPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const queued = await countTicketQueue(eventId);

  return (
    <PageShell
      back={{ href: `/admin/events/${eventId}/attendees`, label: "Uczestnicy" }}
      title="Import gości"
      description="Dodanie gości nie wysyła maili. Bilety wysyłasz osobno, gdy lista jest gotowa."
    >
      <TicketSender eventId={eventId} queued={queued} />
      <GuestImportForm eventId={eventId} />
    </PageShell>
  );
}
