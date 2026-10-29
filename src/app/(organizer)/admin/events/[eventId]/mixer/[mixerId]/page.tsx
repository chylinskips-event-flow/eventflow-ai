import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import {
  getMixer,
  getMixerParticipants,
  getMixerPlan,
  getMixerRounds,
} from "@/lib/mixer/getters";
import { createAdminClient } from "@/lib/supabase/admin";
import { MixerDetail } from "./mixer-detail";
import { featureGate } from "@/lib/entitlements";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { resolveTabKey } from "@/lib/url-tabs";
import { MIXER_DEFAULT_TAB, enabledTabKeys, mixerTabs } from "@/lib/organizer-tabs";

export default async function MixerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; mixerId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ eventId, mixerId }, { tab }] = await Promise.all([params, searchParams]);

  const [event, mixer, participants, plan, rounds] = await Promise.all([
    getOwnEvent(eventId),
    getMixer(mixerId, eventId),
    getMixerParticipants(mixerId, eventId),
    getMixerPlan(mixerId, eventId),
    getMixerRounds(mixerId, eventId),
  ]);

  if (!event || !mixer) notFound();

  const gate = await featureGate(event.organization_id, "business_mixer");
  if (!gate.ok) return <FeatureLockedPage title="Business Mixer" message={gate.message} />;

  // Fetch approved attendees for "add from list" dialog
  const supabase = createAdminClient();
  const { data: rawAttendees } = await supabase
    .from("attendees")
    .select("id, first_name, last_name, company")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("last_name", { ascending: true });

  const attendees = ((rawAttendees ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  }[]).map((a) => ({
    id: a.id,
    name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
    company: a.company ?? null,
  }));

  // IDs already in mixer (any status) — to filter out of "add" dialog
  const existingIds = new Set(
    participants.map((p) => p.attendee_id).filter((id): id is string => id != null),
  );

  // „Plan” w szkicu jest nieaktywny — `?tab=plan` otwiera wtedy domyślną zakładkę.
  const activeCount = participants.filter((p) => p.status === "active").length;
  const initialTab = resolveTabKey(
    tab,
    enabledTabKeys(mixerTabs({ status: mixer.status, activeCount })),
    MIXER_DEFAULT_TAB,
  );

  return (
    <MixerDetail
      initialTab={initialTab}
      eventId={eventId}
      mixer={mixer}
      participants={participants}
      plan={plan}
      rounds={rounds}
      allAttendees={attendees}
      existingAttendeeIds={[...existingIds]}
    />
  );
}
