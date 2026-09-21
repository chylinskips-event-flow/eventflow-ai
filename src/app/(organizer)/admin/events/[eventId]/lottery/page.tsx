import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { LotteryClient } from "./lottery-client";

export default async function LotteryPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();

  if (!event.gamification_enabled || event.lottery_points_per_ticket == null) {
    notFound();
  }

  const pointsPerTicket = event.lottery_points_per_ticket;

  const admin = createAdminClient();
  const { data: rawAttendees } = await admin
    .from("attendees")
    .select("id, first_name, last_name, company, points")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("last_name", { ascending: true });

  type AttendeeRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    points: number;
  };

  const attendees: AttendeeRow[] = (rawAttendees ?? []).map((a) => ({
    id: a.id as string,
    first_name: a.first_name as string | null,
    last_name: a.last_name as string | null,
    company: a.company as string | null,
    points: (a.points as number) ?? 0,
  }));

  // Tylko uczestnicy z ≥1 biletem losowania
  const eligible = attendees.filter(
    (a) => Math.floor(a.points / pointsPerTicket) >= 1,
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Loteria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          1 bilet za każde {pointsPerTicket} pkt. Uczestnicy z większą liczbą
          punktów mają proporcjonalnie więcej szans.
        </p>
      </div>

      <LotteryClient
        pointsPerTicket={pointsPerTicket}
        eligible={eligible}
      />
    </main>
  );
}
