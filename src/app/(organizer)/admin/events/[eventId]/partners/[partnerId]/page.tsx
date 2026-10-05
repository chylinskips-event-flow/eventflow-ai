import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getPartnerById } from "@/lib/partners";
import {
  getPartnerAccessList,
  getPartnerContact,
  getPartnerMaterials,
  getProfileDraft,
  publishedProfile,
} from "@/lib/partner-portal";
import { accessStatus, changedProfileFields } from "@/lib/partner-portal-core";
import { partnerTierLabel } from "@/lib/partner-options";
import { getOrigin } from "@/lib/request-origin";
import { getCurrentTimestamp } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Badge } from "@/components/ui/badge";
import { PartnerPortalAdmin } from "./partner-portal-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PartnerPortalAdminPage({
  params,
}: {
  params: Promise<{ eventId: string; partnerId: string }>;
}) {
  const { eventId, partnerId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event || !UUID.test(partnerId)) notFound();
  const gate = await featureGate(event.organization_id, "partner_portal");
  if (!gate.ok) return <FeatureLockedPage title="Panel partnera" message={gate.message} />;

  const partner = await getPartnerById(eventId, partnerId);
  if (!partner) notFound();

  const [access, draft, materials, contact] = await Promise.all([
    getPartnerAccessList(partnerId),
    getProfileDraft(partnerId),
    getPartnerMaterials(partnerId),
    getPartnerContact(partnerId),
  ]);
  const origin = getOrigin(await headers());
  const now = getCurrentTimestamp();
  const published = publishedProfile(partner);
  const tier = partnerTierLabel(partner.tier);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Link
        href={`/admin/events/${eventId}/partners`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Wszyscy partnerzy
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{partner.name}</h1>
          {tier && <Badge variant="secondary">{tier}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Panel partnera: dostęp dla osób z firmy partnera, akceptacja ich zmian w wizytówce
          i materiałach. Poziom partnerstwa ustawiasz Ty (Edytuj na liście partnerów).
        </p>
      </div>

      <PartnerPortalAdmin
        eventId={eventId}
        partnerId={partnerId}
        access={access.map((a) => {
          const status = accessStatus(a, now);
          return {
            id: a.id,
            email: a.email,
            status,
            invited_at: a.invited_at,
            last_seen_at: a.last_seen_at,
            inviteUrl: status === "invited" ? `${origin}/partner/invite/${a.invite_token}` : null,
          };
        })}
        published={published}
        draft={draft}
        changed={draft ? changedProfileFields(published, draft) : []}
        materials={materials}
        contact={contact}
        timezone={event.timezone}
      />
    </main>
  );
}
