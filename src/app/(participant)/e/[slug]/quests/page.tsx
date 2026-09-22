import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, MapPin, Trophy, Users, User } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeLevel,
  computeNextLevelThreshold,
  LEVEL_LABELS,
} from "@/lib/gamification";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const TYPE_LABELS: Record<string, string> = {
  booth_visit: "Odwiedziny stoiska",
  booth_quiz: "Quiz przy stoisku",
  booth_password: "Hasło przy stoisku",
  networking_contacts: "Networking",
  profile_complete: "Profil",
};

const QUEST_ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  booth_visit:         { icon: MapPin, cls: "text-primary" },
  booth_quiz:          { icon: MapPin, cls: "text-primary" },
  booth_password:      { icon: MapPin, cls: "text-primary" },
  networking_contacts: { icon: Users,  cls: "text-aqua"   },
  profile_complete:    { icon: User,   cls: "text-primary" },
};
const FALLBACK_ICON = QUEST_ICONS.booth_visit;

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
    const partnerRaw = q.partners as { name: string; booth_location: string | null } | { name: string; booth_location: string | null }[] | null;
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

  const points = attendee.points ?? 0;
  const level = computeLevel(points);
  const nextThreshold = computeNextLevelThreshold(points);
  const prevThreshold =
    level === "explorer"   ? 0   :
    level === "connector"  ? 100 :
    level === "networker"  ? 250 :
    500;
  const progressPct = nextThreshold
    ? Math.min(100, Math.round(((points - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100;

  const remainingPoints = quests
    .filter((q) => !q.done)
    .reduce((s, q) => s + (q.points_value ?? 0), 0);
  const allDone = quests.length > 0 && quests.every((q) => q.done);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 pb-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/e/${slug}`}>← Powrót</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Zadania</h1>
        <p className="text-sm text-muted-foreground">{event.name}</p>
      </div>

      {/* Pasek postępu punktów */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
                {LEVEL_LABELS[level]}
              </span>
              <span className="text-xl font-bold tabular-nums">{points} pkt</span>
            </div>
            {nextThreshold && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {points} / {nextThreshold}
              </span>
            )}
          </div>
          <Progress value={progressPct} className="h-2" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {nextThreshold
                ? `Pozostało do ${LEVEL_LABELS[computeLevel(nextThreshold)]}: ${nextThreshold - points} pkt`
                : "Najwyższy poziom 🏆"}
              {allDone && <span className="ml-2">· Wszystkie zadania ukończone 🎉</span>}
              {!allDone && remainingPoints > 0 && (
                <span className="ml-2 opacity-70">· Do zdobycia: {remainingPoints} pkt</span>
              )}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/e/${slug}/ranking`}>
                <Trophy className="size-4" /> Ranking
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {quests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nie zdefiniowano jeszcze żadnych zadań dla tego wydarzenia.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {quests.map((q) => {
            const iconDef = QUEST_ICONS[q.type] ?? FALLBACK_ICON;
            const QIcon = iconDef.icon;
            return (
              <Card key={q.id} className={q.done ? "opacity-60" : undefined}>
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="mt-0.5 shrink-0">
                    {q.done ? (
                      <CheckCircle2 className="size-5 text-aqua" />
                    ) : (
                      <QIcon className={`size-5 ${iconDef.cls}`} />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium${q.done ? " line-through decoration-muted-foreground/50" : ""}`}>
                        {q.title}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {TYPE_LABELS[q.type] ?? q.type}
                      </span>
                    </div>
                    {q.description && (
                      <p className="text-sm text-muted-foreground">{q.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {q.partnerName && (
                        <span>
                          {q.partnerName}
                          {q.boothLocation ? ` · ${q.boothLocation}` : ""}
                        </span>
                      )}
                      {q.target_value != null && (
                        <span>Cel: {q.target_value} kontaktów</span>
                      )}
                    </div>
                  </div>
                  {q.points_value != null && (
                    <span className="shrink-0 rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
                      {q.done ? "✓ " : "+"}{q.points_value} pkt
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
