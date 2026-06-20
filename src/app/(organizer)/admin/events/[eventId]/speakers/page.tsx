import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventSpeakers } from "@/lib/speakers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SpeakerFormDialog } from "./speaker-form-dialog";
import { SpeakerCard } from "./speaker-card";

export default async function EventSpeakersPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  const speakers = await getEventSpeakers(eventId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prelegenci</h1>
        <SpeakerFormDialog
          eventId={eventId}
          trigger={<Button>Dodaj prelegenta</Button>}
        />
      </div>

      {speakers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych prelegentów.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {speakers.map((speaker) => (
            <SpeakerCard key={speaker.id} eventId={eventId} speaker={speaker} />
          ))}
        </div>
      )}
    </main>
  );
}
