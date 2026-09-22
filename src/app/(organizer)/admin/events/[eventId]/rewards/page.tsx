import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RewardFormDialog, type RewardForEdit } from "./reward-form-dialog";
import { RewardCard } from "./reward-card";
import { RedeemSection } from "./redeem-section";

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();

  const supabase = createAdminClient();

  const [
    { data: rawRewards },
    { data: rawRedemptions },
    { data: rawAttendees },
  ] = await Promise.all([
    supabase
      .from("rewards")
      .select("id, name, description, points_required, stock, image_url, badge_label")
      .eq("event_id", eventId)
      .order("points_required", { ascending: true }),
    supabase
      .from("reward_redemptions")
      .select("reward_id, attendee_id")
      .in(
        "reward_id",
        // placeholder — pobrany poniżej po rewards
        ["00000000-0000-0000-0000-000000000000"],
      ),
    supabase
      .from("attendees")
      .select("id, first_name, last_name, company, points")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .order("last_name", { ascending: true }),
  ]);

  const rewards: RewardForEdit[] = (rawRewards ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    points_required: r.points_required as number,
    stock: r.stock as number | null,
    image_url: (r.image_url as string | null) ?? null,
    badge_label: (r.badge_label as string | null) ?? null,
  }));

  // Pobierz redempcje dla rzeczywistych ID nagród
  const rewardIds = rewards.map((r) => r.id);
  const { data: redemptionsData } = rewardIds.length > 0
    ? await supabase
        .from("reward_redemptions")
        .select("reward_id, attendee_id")
        .in("reward_id", rewardIds)
    : { data: [] };
  void rawRedemptions; // unused placeholder

  const redemptions = (redemptionsData ?? []) as { reward_id: string; attendee_id: string }[];

  const redemptionCountMap: Record<string, number> = {};
  for (const r of redemptions) {
    redemptionCountMap[r.reward_id] = (redemptionCountMap[r.reward_id] ?? 0) + 1;
  }

  const attendees = (rawAttendees ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    points: number;
  }[];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nagrody</h1>
          {!event.gamification_enabled && (
            <p className="mt-1 text-sm font-medium text-yellow-600 dark:text-yellow-400">
              Grywalizacja wyłączona — nagrody nie są widoczne dla uczestników.
            </p>
          )}
        </div>
        <RewardFormDialog
          eventId={eventId}
          trigger={<Button className="shrink-0">Dodaj nagrodę</Button>}
        />
      </div>

      {rewards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nie zdefiniowano jeszcze żadnych nagród.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rewards.map((r) => (
            <RewardCard
              key={r.id}
              eventId={eventId}
              reward={r}
              redemptionCount={redemptionCountMap[r.id] ?? 0}
            />
          ))}
        </div>
      )}

      {rewards.length > 0 && attendees.length > 0 && (
        <RedeemSection
          eventId={eventId}
          rewards={rewards}
          attendees={attendees}
          existingRedemptions={redemptions}
        />
      )}
    </main>
  );
}
