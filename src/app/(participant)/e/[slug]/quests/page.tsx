import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHero } from "@/components/participant/section-hero";
import { PointsLevelWidget } from "@/components/participant/points-level-widget";
import { QuestCard } from "./quest-card";

export default async function QuestsPage({
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

  const [{ data: rawQuests }, { data: completions }] = await Promise.all([
    supabase
      .from("quests")
      .select(
        "id, type, title, description, points_value, partner_id, target_value, partners(name, booth_location)",
      )
      .eq("event_id", event.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("quest_completions")
      .select("quest_id, points_awarded")
      .eq("attendee_id", attendee.id),
  ]);

  const doneSet = new Set((completions ?? []).map((c) => c.quest_id as string));

  type QuestRow = {
    id: string;
    type: string;
    title: string;
    description: string | null;
    points_value: number | null;
    partner_id: string | null;
    target_value: number | null;
    done: boolean;
    partnerName: string | null;
    boothLocation: string | null;
  };

  const quests: QuestRow[] = (rawQuests ?? []).map((q) => {
    const partnerRaw = q.partners as
      | { name: string; booth_location: string | null }
      | { name: string; booth_location: string | null }[]
      | null;
    const partner = Array.isArray(partnerRaw) ? (partnerRaw[0] ?? null) : partnerRaw;
    return {
      id: q.id as string,
      type: q.type as string,
      title: q.title as string,
      description: q.description as string | null,
      points_value: q.points_value as number | null,
      partner_id: q.partner_id as string | null,
      target_value: q.target_value as number | null,
      done: doneSet.has(q.id as string),
      partnerName: partner?.name ?? null,
      boothLocation: partner?.booth_location ?? null,
    };
  });

  // Ukończone questy na dół listy
  const sortedQuests = [
    ...quests.filter((q) => !q.done),
    ...quests.filter((q) => q.done),
  ];

  const remainingPoints = quests
    .filter((q) => !q.done)
    .reduce((s, q) => s + (q.points_value ?? 0), 0);
  const allDone = quests.length > 0 && quests.every((q) => q.done);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 pb-8">
      <SectionHero
        headline="Zdobywaj"
        headlineAccent="punkty"
        subtitle="Realizuj questy, zbieraj punkty i wymieniaj je na nagrody."
        imageSrc="/hero/hero-questy.webp"
        imageAlt="Uczestniczka skanująca kod QR na stoisku"
      />

      <PointsLevelWidget
        points={attendee.points ?? 0}
        rankingHref={`/e/${slug}/ranking`}
      />

      {quests.length > 0 && (allDone || remainingPoints > 0) && (
        <p className="text-xs text-muted-foreground">
          {allDone
            ? "Wszystkie zadania ukończone 🎉"
            : `Do zdobycia: ${remainingPoints} pkt`}
        </p>
      )}

      {quests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Trophy className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Organizator nie dodał jeszcze questów dla tego wydarzenia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedQuests.map((q) => (
            <QuestCard
              key={q.id}
              type={q.type}
              title={q.title}
              description={q.description}
              pointsValue={q.points_value}
              partnerName={q.partnerName}
              boothLocation={q.boothLocation}
              targetValue={q.target_value}
              done={q.done}
            />
          ))}
        </div>
      )}
    </main>
  );
}
