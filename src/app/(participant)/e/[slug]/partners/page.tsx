import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { getEventPartnersForParticipant } from "@/lib/partners";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHero, SectionHeroMedia } from "@/components/participant/section-hero";
import { PartnerGrid } from "../partner-grid";

export default async function PartnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";

  const event = await getEventBySlugForRegistration(slug);
  if (!event) redirect(eventRoot);
  const isPublic = event.status === "published" || event.status === "live";
  if (!isPublic && !(await getCurrentAttendee(slug))) redirect(eventRoot);

  const partners = await getEventPartnersForParticipant(event.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Partnerzy"
        headlineAccent="wydarzenia"
        subtitle="Firmy, które współtworzą wydarzenie — sprawdź ich oferty i materiały."
        media={<SectionHeroMedia icon={Handshake} />}
        backHref={eventRoot}
      />
      {partners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Organizator nie dodał jeszcze partnerów.
          </CardContent>
        </Card>
      ) : (
        <PartnerGrid partners={partners} hrefFor={(id) => buildEventInternalPath(slug, `/partners/${id}`, origin)} />
      )}
    </main>
  );
}
