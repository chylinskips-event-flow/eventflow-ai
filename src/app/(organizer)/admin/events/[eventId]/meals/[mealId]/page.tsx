import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventMeal, getMealAttendees } from "@/lib/meals";
import { MealPanel } from "@/components/meal-panel";
import { PageShell } from "@/components/page-shell";
import { organizerRedeemById, organizerRedeemByQr, organizerUndoRedemption } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MealPage({
  params,
}: {
  params: Promise<{ eventId: string; mealId: string }>;
}) {
  const { eventId, mealId } = await params;
  if (!UUID.test(mealId)) notFound();
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const meal = await getEventMeal(eventId, mealId);
  if (!meal) notFound();
  const attendees = await getMealAttendees(meal);

  return (
    <PageShell back={{ href: `/admin/events/${eventId}/meals`, label: "Posiłki" }} title={meal.name}>
      <div className="-mx-4 sm:-mx-6">
        <MealPanel
          mealName={meal.name}
          attendees={attendees}
          redeemByQrAction={organizerRedeemByQr.bind(null, eventId, mealId)}
          redeemByIdAction={organizerRedeemById.bind(null, eventId, mealId)}
          undoAction={organizerUndoRedemption.bind(null, eventId, mealId)}
          stickyTopClass="top-14"
        />
      </div>
    </PageShell>
  );
}
