import { getEventBySlugForRegistration } from "@/lib/events";
import { getEventColorVars } from "@/lib/event-theme";
import { LegalFooter } from "@/components/legal-footer";
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

  // BRAK cookie bannera jest świadomy: aplikacja używa wyłącznie cookies
  // NIEZBĘDNYCH (token uczestnika, sesja auth), które nie wymagają zgody w myśl
  // RODO/ePrivacy. Jeśli w przyszłości dojdą cookies analityczne/marketingowe
  // (np. analytics), TRZEBA dodać baner zgody i zarządzanie preferencjami.
  return (
    <div style={colorVars} className="flex min-h-full flex-col">
      {event && <EventHeader event={event} />}
      <div className="flex-1">{children}</div>
      <LegalFooter />
    </div>
  );
}
