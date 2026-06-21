import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventContentSections } from "@/lib/event-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BannerUpload } from "./banner-upload";
import { SectionFormDialog } from "./section-form-dialog";
import { SectionCard } from "./section-card";

export default async function EventContentPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  const sections = await getEventContentSections(eventId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Treść</h1>

      <BannerUpload eventId={eventId} bannerUrl={event.banner_url} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Sekcje opisu</h2>
        <SectionFormDialog
          eventId={eventId}
          trigger={<Button>Dodaj sekcję</Button>}
        />
      </div>

      {sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych sekcji opisu tego eventu.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <SectionCard
              key={section.id}
              eventId={eventId}
              section={section}
              isFirst={index === 0}
              isLast={index === sections.length - 1}
            />
          ))}
        </div>
      )}
    </main>
  );
}
