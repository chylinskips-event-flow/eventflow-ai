"use server";

import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";

export type DrawResult =
  | {
      status: "ok";
      winner: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        company: string | null;
        points: number;
        tickets: number;
      };
    }
  | { status: "empty" }
  | { status: "error"; message: string };

export async function drawLotteryWinner(
  eventId: string,
  excludedIds: string[],
): Promise<DrawResult> {
  const event = await getOwnEvent(eventId);
  if (!event) return { status: "error", message: "Brak dostępu do eventu." };
  if (!event.gamification_enabled || event.lottery_points_per_ticket == null) {
    return { status: "error", message: "Loteria nieaktywna dla tego eventu." };
  }

  const ppt = event.lottery_points_per_ticket;
  const admin = createAdminClient();

  const { data: rawAttendees } = await admin
    .from("attendees")
    .select("id, first_name, last_name, company, points")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .gte("points", ppt);

  type Row = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    points: number;
  };

  const excluded = new Set(excludedIds);
  const pool: (Row & { tickets: number })[] = (rawAttendees ?? [])
    .map((a) => ({
      id: a.id as string,
      first_name: a.first_name as string | null,
      last_name: a.last_name as string | null,
      company: a.company as string | null,
      points: (a.points as number) ?? 0,
      tickets: Math.floor(((a.points as number) ?? 0) / ppt),
    }))
    .filter((a) => !excluded.has(a.id) && a.tickets >= 1);

  if (pool.length === 0) return { status: "empty" };

  // Ważone losowanie: cumulative sum + jeden losowy punkt — wynik deterministyczny
  const totalTickets = pool.reduce((s, a) => s + a.tickets, 0);
  const roll = Math.random() * totalTickets;

  let cumulative = 0;
  let winner = pool[0];
  for (const a of pool) {
    cumulative += a.tickets;
    if (roll < cumulative) {
      winner = a;
      break;
    }
  }

  // Zapisz do event_analytics_log (RLS deny-all → admin client)
  await admin.from("event_analytics_log").insert({
    event_id: eventId,
    attendee_id: winner.id,
    action_type: "lottery_winner",
    metadata: {
      tickets: winner.tickets,
      total_tickets: totalTickets,
      excluded_count: excludedIds.length,
      round: excludedIds.length + 1,
    },
  });

  return { status: "ok", winner };
}
