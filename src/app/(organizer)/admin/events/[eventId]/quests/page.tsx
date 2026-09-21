import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventPartners } from "@/lib/partners";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuestFormDialog, type QuestForEdit } from "./quest-form-dialog";
import { QuestCard } from "./quest-card";
import { SeedQuestsButton } from "./seed-button";

export default async function QuestsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, partners] = await Promise.all([
    getOwnEvent(eventId),
    getEventPartners(eventId),
  ]);

  if (!event) notFound();

  const supabase = await createClient();
  const { data: rawQuests } = await supabase
    .from("quests")
    .select("id, type, title, description, points_value, partner_id, target_value, is_active, config")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const quests: QuestForEdit[] = (rawQuests ?? []).map((q) => ({
    id: q.id as string,
    type: q.type as string,
    title: q.title as string,
    description: q.description as string | null,
    points_value: q.points_value as number | null,
    partner_id: q.partner_id as string | null,
    target_value: q.target_value as number | null,
    is_active: q.is_active as boolean,
    config: q.config as QuestForEdit["config"],
  }));

  const partnerMap = new Map(partners.map((p) => [p.id, p.name]));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Questy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zadania dla uczestników — punkty, poziomy, grywalizacja.
          </p>
          {!event.gamification_enabled && (
            <p className="mt-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
              Grywalizacja jest wyłączona dla tego eventu. Włącz ją w Ustawieniach, aby questy były widoczne dla uczestników.
            </p>
          )}
        </div>
        <QuestFormDialog
          eventId={eventId}
          partners={partners}
          trigger={<Button className="shrink-0">Dodaj quest</Button>}
        />
      </div>

      {quests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych questów.
            </p>
            <SeedQuestsButton eventId={eventId} />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {quests.map((quest) => (
            <QuestCard
              key={quest.id}
              eventId={eventId}
              quest={quest}
              partners={partners}
              partnerName={quest.partner_id ? (partnerMap.get(quest.partner_id) ?? null) : null}
            />
          ))}
        </div>
      )}
    </main>
  );
}
