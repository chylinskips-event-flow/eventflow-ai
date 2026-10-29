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
import { PageShell } from "@/components/page-shell";
import { TabbedSections } from "@/components/tabbed-sections";
import { resolveTabKey } from "@/lib/url-tabs";
import { CONTENT_DEFAULT_TAB, CONTENT_TABS, CONTENT_TAB_KEYS } from "@/lib/organizer-tabs";

export default async function EventContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId }, { tab }] = await Promise.all([params, searchParams]);
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  const pageBuilderGate = await featureGate(event.organization_id, "page_builder");

  const [sections, eventSections] = await Promise.all([
    getEventContentSections(eventId),
    getEventSections(eventId),
  ]);

  const descriptionPanel = (
    <>
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
    </>
  );

  return (
    <PageShell title="Treść" description="Baner, opis wydarzenia i dodatkowe sekcje strony publicznej.">
      {!pageBuilderGate.ok && <UpgradeNotice message={pageBuilderGate.message} />}

      <TabbedSections
        tabs={[...CONTENT_TABS]}
        initialTab={resolveTabKey(tab, CONTENT_TAB_KEYS, CONTENT_DEFAULT_TAB)}
        defaultTab={CONTENT_DEFAULT_TAB}
        idPrefix="content"
        ariaLabel="Sekcje treści"
        panels={{
          opis: descriptionPanel,
          strona: (
            <>
              <p className="text-sm text-muted-foreground">Widoczne po agendzie, przed rejestracją.</p>
              <EventSectionsBuilder eventId={eventId} initialSections={eventSections} />
            </>
          ),
        }}
      />
    </PageShell>
  );
}
