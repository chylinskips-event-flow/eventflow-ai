import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHero } from "@/components/participant/section-hero";
import { PointsLevelWidget } from "@/components/participant/points-level-widget";
import { FilterPills } from "@/components/participant/filter-pills";
import type { TierFilter } from "@/components/participant/filter-pills";
import { RewardCard } from "@/components/participant/reward-card";

function tierRange(tier: TierFilter): [number, number] | null {
  if (tier === "0-100")   return [0, 100];
  if (tier === "101-300") return [101, 300];
  if (tier === "301-500") return [301, 500];
  if (tier === "500+")    return [501, Infinity];
  return null;
}

export default async function RewardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tier?: string }>;
}) {
  const { slug } = await params;
  const { tier: tierParam } = await searchParams;

  const attendee = await getCurrentAttendee(slug);
  if (!attendee) redirect(`/e/${slug}`);

  const event = await getEventBySlugForRegistration(slug);
  if (!event) redirect(`/e/${slug}`);
  if (!event.gamification_enabled) redirect(`/e/${slug}`);

  const myPoints = attendee.points ?? 0;

  const validTiers: TierFilter[] = ["all", "0-100", "101-300", "301-500", "500+"];
  const activeTier: TierFilter =
    validTiers.includes(tierParam as TierFilter) ? (tierParam as TierFilter) : "all";

  const supabase = createAdminClient();

  const { data: allRewards } = await supabase
    .from("rewards")
    .select("id, name, description, points_required, stock")
    .eq("event_id", event.id)
    .order("points_required", { ascending: true });

  const rewards = (allRewards ?? []) as {
    id: string;
    name: string;
    description: string | null;
    points_required: number;
    stock: number | null;
  }[];

  // Fetch which rewards this attendee has already redeemed
  const { data: redemptionRows } = await supabase
    .from("reward_redemptions")
    .select("reward_id")
    .eq("attendee_id", attendee.id);

  const redeemedIds = new Set((redemptionRows ?? []).map((r: { reward_id: string }) => r.reward_id));

  // Apply tier filter
  const range = tierRange(activeTier);
  const filtered = range
    ? rewards.filter((r) => r.points_required >= range[0] && r.points_required <= range[1])
    : rewards;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Nagrody"
        headlineAccent={event.name}
        subtitle="Wymień zebrane punkty na nagrody u organizatora."
      />

      <PointsLevelWidget
        points={myPoints}
        rankingHref={`/e/${slug}/ranking`}
      />

      {rewards.length > 0 && (
        <FilterPills active={activeTier} />
      )}

      {filtered.length === 0 && rewards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Gift className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Organizator nie zdefiniował jeszcze nagród dla tego wydarzenia.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Brak nagród w tym przedziale punktowym.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((r) => (
            <RewardCard
              key={r.id}
              id={r.id}
              name={r.name}
              description={r.description}
              pointsRequired={r.points_required}
              stock={r.stock}
              attendeePoints={myPoints}
              redeemed={redeemedIds.has(r.id)}
            />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Nagrody odbierane są u organizatora po zakończeniu eventu.
      </p>
    </main>
  );
}
