import { EventNav } from "./event-nav";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    <div className="flex min-h-screen flex-col">
      <EventNav eventId={eventId} />
      {children}
    </div>
  );
}
