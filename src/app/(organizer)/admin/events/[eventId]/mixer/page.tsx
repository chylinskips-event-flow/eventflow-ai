import { notFound } from "next/navigation";
import Link from "next/link";
import { Network, ChevronRight } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { getMixers } from "@/lib/mixer/getters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateMixerDialog } from "./create-mixer-dialog";
import { SeedAttendeesButton } from "./seed-attendees-button";

const STATUS_LABEL: Record<string, string> = {
  draft:     "Szkic",
  generated: "Wygenerowany",
  locked:    "Zablokowany",
};

const STATUS_VARIANT: Record<string, "outline" | "warning" | "success" | "indigo"> = {
  draft:     "outline",
  generated: "indigo",
  locked:    "success",
};

export default async function MixerListPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, mixers] = await Promise.all([
    getOwnEvent(eventId),
    getMixers(eventId),
  ]);

  if (!event) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Business Mixer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatyczny przydział uczestników do stolików — maksimum nowych znajomości.
          </p>
        </div>
        <CreateMixerDialog
          eventId={eventId}
          trigger={<Button className="shrink-0">Nowy mixer</Button>}
        />
      </div>

      {mixers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Network className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nie masz jeszcze żadnego mixera.</p>
            <CreateMixerDialog
              eventId={eventId}
              trigger={<Button variant="outline">Utwórz pierwszy mixer</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {mixers.map((mixer) => (
            <Link
              key={mixer.id}
              href={`/admin/events/${eventId}/mixer/${mixer.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Network className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{mixer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {mixer.rounds_count} rundy · {mixer.table_count} stoliki
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={STATUS_VARIANT[mixer.status] ?? "outline"}>
                  {STATUS_LABEL[mixer.status] ?? mixer.status}
                </Badge>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <SeedAttendeesButton eventId={eventId} />
    </main>
  );
}
