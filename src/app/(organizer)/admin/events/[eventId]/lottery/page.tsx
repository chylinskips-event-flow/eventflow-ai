import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { LotteryClient } from "./lottery-client";
import { featureGate } from "@/lib/entitlements";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { buildLotteryPool, loadLotteryCandidates, loadLotteryExclusions } from "@/lib/lottery";

export default async function LotteryPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();

  const gate = await featureGate(event.organization_id, "gamification_rewards");
  if (!gate.ok) return <FeatureLockedPage title="Loteria" message={gate.message} />;

  if (!event.gamification_enabled || event.lottery_points_per_ticket == null) {
    notFound();
  }

  const pointsPerTicket = event.lottery_points_per_ticket;

  const admin = createAdminClient();
  // Pełna lista stronami (PostgREST zwraca maks. 1000 wierszy na zapytanie) + wykluczenia z bazy
  const [{ data: candidates }, { data: excludedIds }] = await Promise.all([
    loadLotteryCandidates(admin, eventId, pointsPerTicket),
    loadLotteryExclusions(admin, eventId),
  ]);

  // Tylko uczestnicy z ≥1 biletem losowania (wykluczonych pokazujemy, ale wyszarzonych)
  const eligible = buildLotteryPool(candidates, pointsPerTicket, new Set())
    .sort((x, y) =>
      x.last_name === y.last_name
        ? 0
        : x.last_name === null
          ? 1
          : y.last_name === null
            ? -1
            : x.last_name.localeCompare(y.last_name, "pl"),
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
        eventId={eventId}
        pointsPerTicket={pointsPerTicket}
        eligible={eligible}
        initialExcludedIds={excludedIds}
      />
    </main>
  );
}
