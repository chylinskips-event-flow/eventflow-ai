import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Gift } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function RewardsPage({
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

  // Nagrody mają RLS SELECT dla authenticated — session client wystarczy
  const supabase = await createClient();
  const { data } = await supabase
    .from("rewards")
    .select("id, name, description, points_required, stock")
    .eq("event_id", event.id)
    .order("points_required", { ascending: true });

  const rewards = (data ?? []) as {
    id: string;
    name: string;
    description: string | null;
    points_required: number;
    stock: number | null;
  }[];

  const myPoints = attendee.points ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 pb-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/e/${slug}`}>
            <ArrowLeft className="size-4" /> Powrót
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Nagrody</h1>
        <p className="text-sm text-muted-foreground">{event.name}</p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="rounded-full bg-coral px-3 py-1 text-sm font-bold tabular-nums text-[#171A2B]">
            {myPoints} pkt
          </span>
          <span className="text-sm text-muted-foreground">Twoje punkty</span>
        </CardContent>
      </Card>

      {rewards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Gift className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Organizator nie zdefiniował jeszcze nagród dla tego wydarzenia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rewards.map((r) => {
            const canAfford = myPoints >= r.points_required;
            const missing = r.points_required - myPoints;
            const outOfStock = r.stock !== null && r.stock <= 0;

            return (
              <Card
                key={r.id}
                className={
                  outOfStock
                    ? "opacity-60"
                    : canAfford
                      ? "border-aqua/50"
                      : undefined
                }
              >
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                    <span className="font-medium">{r.name}</span>
                    {r.description && (
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
                        {r.points_required} pkt
                      </span>
                      {r.stock !== null && (
                        <span className="text-xs text-muted-foreground">
                          {r.stock > 0 ? `Dostępność: ${r.stock} szt.` : "Wyczerpane"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {outOfStock ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        Wyczerpane
                      </span>
                    ) : canAfford ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-aqua">
                        <CheckCircle2 className="size-4" />
                        Stać Cię!
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Brakuje {missing} pkt
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Nagrody odbierane są u organizatora po zakończeniu eventu.
      </p>
    </main>
  );
}
