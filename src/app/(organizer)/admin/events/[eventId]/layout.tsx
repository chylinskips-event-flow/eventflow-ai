import { getOwnEvent } from "@/lib/events";
import { EventNav } from "./event-nav";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  // Slug do linku "Podgląd" widocznego ze wszystkich zakładek eventu.
  const event = await getOwnEvent(eventId);

  return (
    <div className="flex min-h-screen flex-col">
      <EventNav eventId={eventId} slug={event?.slug ?? null} />
      {children}
    </div>
  );
}
