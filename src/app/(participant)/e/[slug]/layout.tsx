import { getCurrentAttendee } from "@/lib/attendee-session";
import { getEventBySlugForRegistration } from "@/lib/events";
import { hasActiveMixerForAttendee } from "@/lib/mixer/participant";
import { BottomNav } from "./bottom-nav";

export default async function ParticipantEventLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const attendee = await getCurrentAttendee(slug);

  if (!attendee) {
    return <>{children}</>;
  }

  const [event, hasMixer] = await Promise.all([
    getEventBySlugForRegistration(slug),
    hasActiveMixerForAttendee(attendee.id),
  ]);

  return (
    <>
      <div className="pb-16 md:pb-0">
        {children}
      </div>
      <BottomNav
        slug={slug}
        gamificationEnabled={event?.gamification_enabled ?? false}
        hasMixer={hasMixer}
      />
    </>
  );
}
