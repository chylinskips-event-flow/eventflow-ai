import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventMeals } from "@/lib/meals";
import { buildEventApexUrl } from "@/lib/event-url";
import { getOrigin } from "@/lib/request-origin";
import { PageShell } from "@/components/page-shell";
import { MealsAdmin } from "./meals-admin";

export default async function MealsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [event, meals, origin] = await Promise.all([
    getOwnEvent(eventId),
    getEventMeals(eventId),
    headers().then(getOrigin),
  ]);
  if (!event) notFound();

  return (
    <PageShell
      title="Posiłki"
      description="Wydawanie po kodzie QR z biletu. Jeden bilet to jedno wydanie na posiłek."
    >
      <MealsAdmin eventId={eventId} meals={meals} staffBaseUrl={`${buildEventApexUrl(event.slug, origin)}/posilek`} />
    </PageShell>
  );
}
