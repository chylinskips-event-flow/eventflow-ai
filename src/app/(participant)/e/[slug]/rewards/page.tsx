import { redirect } from "next/navigation";
import { CheckCircle2, Gift } from "lucide-react";
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

function shortDate(isoString: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
  }).format(new Date(isoString));
}

const HOW_TO_EARN = [
  "Wykonaj questy u partnerów i stoisk",
  "Nawiązuj kontakty z uczestnikami",
  "Uzupełnij swój profil",
  "Bierz udział w sesjach i warsztatach",
];

type RedemptionRow = {
  reward_id: string;
  redeemed_at: string;
  rewards: { name: string; points_required: number } | null;
};

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

  const [
    { data: allRewards },
    { data: redemptionRows },
    { data: recentRedemptions },
  ] = await Promise.all([
    supabase
      .from("rewards")
      .select("id, name, description, points_required, stock, image_url, badge_label")
      .eq("event_id", event.id)
      .order("points_required", { ascending: true }),
    supabase
      .from("reward_redemptions")
      .select("reward_id")
      .eq("attendee_id", attendee.id),
    supabase
      .from("reward_redemptions")
      .select("reward_id, redeemed_at, rewards(name, points_required)")
      .eq("attendee_id", attendee.id)
      .order("redeemed_at", { ascending: false })
      .limit(3),
  ]);

  const rewards = (allRewards ?? []) as {
    id: string;
    name: string;
    description: string | null;
    points_required: number;
    stock: number | null;
    image_url: string | null;
    badge_label: string | null;
  }[];

  const redeemedIds = new Set(
    (redemptionRows ?? []).map((r: { reward_id: string }) => r.reward_id),
  );

  const myRedemptions = (recentRedemptions ?? []) as unknown as RedemptionRow[];

  const range = tierRange(activeTier);
  const filtered = range
    ? rewards.filter(
        (r) => r.points_required >= range[0] && r.points_required <= range[1],
      )
    : rewards;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Nagrody"
        headlineAccent={event.name}
        subtitle="Wymień zebrane punkty na nagrody u organizatora."
        callout="Małe punkty. Wielkie możliwości."
      />

      <PointsLevelWidget
        points={myPoints}
        rankingHref={`/e/${slug}/ranking`}
      />

      {/* Ostatnie odbiory — tylko gdy istnieją */}
      {myRedemptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Moje odbiory</p>
          <div className="flex flex-col gap-1.5">
            {myRedemptions.map((row) => {
              const reward = row.rewards;
              if (!reward) return null;
              return (
                <div
                  key={row.reward_id}
                  className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                    <span className="truncate text-sm font-medium">
                      {reward.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-2">
                    <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#171A2B]">
                      {reward.points_required} pkt
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {shortDate(row.redeemed_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtry — tylko gdy są nagrody */}
      {rewards.length > 0 && <FilterPills active={activeTier} />}

      {/* Siatka nagród */}
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
            <p className="text-sm text-muted-foreground">
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
              imageUrl={r.image_url}
              badgeLabel={r.badge_label}
            />
          ))}
        </div>
      )}

      {/* Jak zdobyć więcej punktów */}
      <div className="rounded-xl border bg-muted/30 px-4 py-4">
        <p className="mb-2.5 text-sm font-semibold">Jak zdobyć więcej punktów?</p>
        <ul className="flex flex-col gap-1.5">
          {HOW_TO_EARN.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Nagrody odbierane są u organizatora po zakończeniu eventu.
      </p>
    </main>
  );
}
