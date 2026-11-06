import { getOwnEvent } from "@/lib/events";
import { getEventMeal, getMealReportCsv } from "@/lib/meals";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Lista wydanych posiłków do rozliczenia z lokalem.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; mealId: string }> },
) {
  const { eventId, mealId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) return new Response("Not found", { status: 404 });
  const meal = await getEventMeal(eventId, mealId);
  if (!meal) return new Response("Not found", { status: 404 });

  const csv = await getMealReportCsv(meal, event.timezone ?? DEFAULT_TIMEZONE);
  const safeName = event.slug.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="posilek-${safeName}-${meal.id.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
