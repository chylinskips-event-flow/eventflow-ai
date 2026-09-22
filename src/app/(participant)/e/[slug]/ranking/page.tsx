import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ListTodo } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeLevel, LEVEL_LABELS } from "@/lib/gamification";
import type { GamificationLevel } from "@/lib/gamification";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const LEVEL_BADGE: Record<GamificationLevel, string> = {
  explorer:   "bg-secondary text-muted-foreground",
  connector:  "bg-coral text-[#171A2B]",
  networker:  "bg-aqua text-[#171A2B]",
  ambassador: "bg-amber-400 text-[#171A2B]",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-[#171A2B]">1</span>;
  if (rank === 2)
    return <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-700">2</span>;
  if (rank === 3)
    return <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-700 text-xs font-bold text-white">3</span>;
  return <span className="w-8 shrink-0 text-center text-sm text-muted-foreground">#{rank}</span>;
}

export default async function RankingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const attendee = await getCurrentAttendee(slug);
  if (!attendee) redirect(`/e/${slug}`);

  const event = await getEventBySlugForRegistration(slug);
  if (!event) redirect(`/e/${slug}`);
  if (!event.gamification_enabled) redirect(`/e/${slug}`);

  const supabase = createAdminClient();

  const { data: allRows } = await supabase
    .from("attendees")
    .select("id, first_name, last_name, company, avatar_url, points, networking_visible")
    .eq("event_id", event.id)
    .eq("status", "approved")
    .order("points", { ascending: false })
    .order("created_at", { ascending: true });

  const rows = (allRows ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    avatar_url: string | null;
    points: number;
    networking_visible: boolean;
  }[];

  const globalRankMap = new Map<string, number>();
  rows.forEach((r, i) => globalRankMap.set(r.id, i + 1));

  const top10 = rows.filter((r) => r.networking_visible).slice(0, 10);

  const myRank = globalRankMap.get(attendee.id) ?? null;
  const myPoints = attendee.points ?? 0;
  const myLevel = computeLevel(myPoints);

  const inTop10 = top10.some((r) => r.id === attendee.id);

  const lotteryTickets =
    event.lottery_points_per_ticket && event.lottery_points_per_ticket > 0
      ? Math.floor(myPoints / event.lottery_points_per_ticket)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 pb-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/e/${slug}`}>
            <ArrowLeft className="size-4" /> Powrót
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ranking</h1>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/e/${slug}/quests`}>
            <ListTodo className="size-4" /> Twoje zadania
          </Link>
        </Button>
      </div>

      {/* TOP 10 */}
      {top10.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Ranking pojawi się, gdy uczestnicy zdobędą pierwsze punkty.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {top10.map((r) => {
            const globalRank = globalRankMap.get(r.id) ?? 0;
            const fullName = [r.first_name, r.last_name].filter(Boolean).join(" ");
            const initials = [r.first_name?.[0], r.last_name?.[0]].filter(Boolean).join("");
            const level = computeLevel(r.points);
            const isSelf = r.id === attendee.id;

            return (
              <Card key={r.id} className={isSelf ? "border-primary bg-primary/5" : undefined}>
                <CardContent className="flex items-center gap-3 py-3">
                  <RankBadge rank={globalRank} />
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage src={r.avatar_url ?? undefined} alt={fullName} />
                    <AvatarFallback>{initials || "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="font-medium truncate">
                      {fullName || "Uczestnik"}
                      {isSelf && <span className="ml-1 text-xs text-primary">(Ty)</span>}
                    </span>
                    {r.company && (
                      <span className="text-xs text-muted-foreground truncate">{r.company}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_BADGE[level] ?? "bg-secondary text-muted-foreground"}`}>
                      {LEVEL_LABELS[level]}
                    </span>
                    <span className="text-sm font-bold tabular-nums">{r.points} pkt</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Własna pozycja gdy poza TOP 10 */}
      {!inTop10 && myRank !== null && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <RankBadge rank={myRank} />
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={attendee.avatar_url ?? undefined} alt="" />
              <AvatarFallback>
                {[attendee.first_name?.[0], attendee.last_name?.[0]].filter(Boolean).join("") || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="font-medium">
                {[attendee.first_name, attendee.last_name].filter(Boolean).join(" ") || "Ty"}
                <span className="ml-1 text-xs text-primary">(Ty)</span>
              </span>
              <span className="text-xs text-muted-foreground">Twoja pozycja</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_BADGE[myLevel] ?? "bg-secondary text-muted-foreground"}`}>
                {LEVEL_LABELS[myLevel]}
              </span>
              <span className="text-sm font-bold tabular-nums">{myPoints} pkt</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Losy loteryjne */}
      {lotteryTickets !== null && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="font-medium">Twoje losy loteryjne</p>
              <p className="text-xs text-muted-foreground">
                1 los za każde {event.lottery_points_per_ticket} pkt
              </p>
            </div>
            <span className="text-2xl font-bold">
              🎟️ ×{lotteryTickets}
            </span>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
