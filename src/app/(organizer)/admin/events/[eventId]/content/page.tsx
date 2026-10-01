import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventContentSections } from "@/lib/event-content";
import { getEventSections } from "@/lib/event-sections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BannerUpload } from "./banner-upload";
import { SectionFormDialog } from "./section-form-dialog";
import { SectionCard } from "./section-card";
import { EventSectionsBuilder } from "./event-sections-builder";
import { featureGate } from "@/lib/entitlements";
import { UpgradeNotice } from "@/components/upgrade-notice";

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

  const pageBuilderGate = await featureGate(event.organization_id, "page_builder");

  const [sections, eventSections] = await Promise.all([
    getEventContentSections(eventId),
    getEventSections(eventId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Treść</h1>

      {!pageBuilderGate.ok && <UpgradeNotice message={pageBuilderGate.message} />}

      <BannerUpload eventId={eventId} bannerUrl={event.banner_url} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
              Nie masz jeszcze żadnych sekcji opisu tego wydarzenia.
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

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-6">
        <h2 className="text-lg font-medium">Sekcje strony</h2>
        <p className="text-xs text-muted-foreground">Widoczne po agendzie, przed rejestracją</p>
      </div>

      <EventSectionsBuilder eventId={eventId} initialSections={eventSections} />
    </main>
  );
}
