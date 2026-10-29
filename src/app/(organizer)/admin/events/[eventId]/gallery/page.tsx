import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getOrigin } from "@/lib/request-origin";
import { formatDateTime, getCurrentTimestamp } from "@/lib/format";
import { uploadLinkState } from "@/lib/gallery-core";
import { getGallerySettings, getGalleryUsage, listOrganizerPhotos, listUploadLinks } from "@/lib/gallery";
import { resolveTabKey } from "@/lib/url-tabs";
import { GALLERY_DEFAULT_TAB, GALLERY_TABS, GALLERY_TAB_KEYS } from "@/lib/organizer-tabs";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { PageShell } from "@/components/page-shell";
import { TabbedSections } from "@/components/tabbed-sections";
import { GalleryLinksPanel, GalleryPhotosPanel, GallerySettingsPanel } from "./gallery-admin";

// Przetwarzanie zdjęć (sharp, HEIC) w akcjach tej strony — więcej czasu niż domyślnie.
export const maxDuration = 60;

export default async function GalleryAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId }, { tab }] = await Promise.all([params, searchParams]);
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const gate = await featureGate(event.organization_id, "event_photos");
  if (!gate.ok) return <FeatureLockedPage title="Galeria" message={gate.message} />;

  const [settings, photos, usage, links, origin] = await Promise.all([
    getGallerySettings(eventId),
    listOrganizerPhotos(eventId),
    getGalleryUsage(eventId),
    listUploadLinks(eventId),
    headers().then(getOrigin),
  ]);
  const linkLabel = new Map(links.map((l) => [l.id, l.label]));
  const now = getCurrentTimestamp();
  const tz = event.timezone;

  return (
    <PageShell
      wide
      title="Galeria"
      description="Zdjęcia z wydarzenia dla uczestników, którzy na nim byli. Bez publicznej galerii."
    >
      <TabbedSections
        tabs={[...GALLERY_TABS]}
        initialTab={resolveTabKey(tab, GALLERY_TAB_KEYS, GALLERY_DEFAULT_TAB)}
        defaultTab={GALLERY_DEFAULT_TAB}
        idPrefix="gallery"
        ariaLabel="Sekcje galerii"
        panels={{
          zdjecia: (
            <GalleryPhotosPanel
              eventId={eventId}
              photos={photos.map((p) => ({
                id: p.id,
                thumbUrl: p.thumb_url,
                hidden: p.hidden,
                watermarked: p.watermarked,
                source: p.upload_link_id ? `Fotograf: ${linkLabel.get(p.upload_link_id) ?? "link"}` : "Organizator",
              }))}
              usage={{
                count: usage.count,
                eventBytes: usage.eventBytes,
                budgetUsedBytes: usage.budget.usedBytes,
                budgetBytes: usage.budget.budgetBytes,
                warn: usage.budget.warn,
                blocked: usage.budget.blocked,
              }}
            />
          ),
          fotograf: (
            <GalleryLinksPanel
              eventId={eventId}
              links={links.map((l) => ({
                id: l.id,
                label: l.label,
                url: `${origin}/g/${l.token}`,
                state: uploadLinkState(l, now),
                expiresLabel: formatDateTime(l.expires_at, tz),
                maxPhotos: l.max_photos,
                photoCount: l.photo_count,
              }))}
            />
          ),
          ustawienia: (
            <GallerySettingsPanel
              eventId={eventId}
              hasLogo={!!event.logo_url}
              settings={{
                enabled: settings.enabled,
                watermarkEnabled: settings.watermark_enabled,
                infoText: settings.info_text ?? "",
                publishedLabel: formatDateTime(settings.published_at, tz),
              }}
            />
          ),
        }}
      />
    </PageShell>
  );
}
