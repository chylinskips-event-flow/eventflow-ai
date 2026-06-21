import { getEventBySlugForRegistration } from "@/lib/events";
import { getEventColorVars } from "@/lib/event-theme";
import { EventHeader } from "./event-header";

export default async function ParticipantEventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlugForRegistration(slug);

  // Brak primary_color -> brak nadpisania CSS variables -> dziedziczy
  // globalny branding (te same tokeny co panel organizatora), nie jakiś
  // trzeci, domyślny kolor. Header i tak musi się wyrenderować, więc
  // zawsze potrzebujemy wspólnego kontenera dla header + children — różni
  // się tylko tym, czy ma inline style z nadpisanymi tokenami.
  const colorVars = event?.primary_color
    ? (getEventColorVars(event.primary_color) as React.CSSProperties)
    : undefined;

  return (
    <div style={colorVars}>
      {event && <EventHeader event={event} />}
      {children}
    </div>
  );
}
