import { getMealAttendees, getMealByToken } from "@/lib/meals";
import { MealPanel } from "@/components/meal-panel";
import { staffRedeemById, staffRedeemByQr, staffUndoRedemption } from "./actions";

export default async function StaffMealPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { token } = await params;

  const found = await getMealByToken(token);
  if (!found) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center">
          <p className="text-sm font-semibold">Link nieaktywny</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ten link wydawania posiłku został wyłączony przez organizatora.
          </p>
        </div>
      </main>
    );
  }

  const { meal, event } = found;
  const attendees = await getMealAttendees(meal);

  return (
    <main>
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {event.name}
        </p>
        <h1 className="text-lg font-semibold leading-tight">{meal.name}</h1>
      </div>

      <MealPanel
        mealName={meal.name}
        attendees={attendees}
        redeemByQrAction={staffRedeemByQr.bind(null, token)}
        redeemByIdAction={staffRedeemById.bind(null, token)}
        undoAction={staffUndoRedemption.bind(null, token)}
        stickyTopClass="top-0"
      />
    </main>
  );
}
