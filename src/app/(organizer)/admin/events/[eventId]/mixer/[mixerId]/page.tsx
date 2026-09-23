import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import {
  getMixer,
  getMixerParticipants,
  getMixerPlan,
} from "@/lib/mixer/getters";
import { createAdminClient } from "@/lib/supabase/admin";
import { MixerDetail } from "./mixer-detail";

export default async function MixerDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; mixerId: string }>;
}) {
  const { eventId, mixerId } = await params;

  const [event, mixer, participants, plan] = await Promise.all([
    getOwnEvent(eventId),
    getMixer(mixerId, eventId),
    getMixerParticipants(mixerId, eventId),
    getMixerPlan(mixerId, eventId),
  ]);

  if (!event || !mixer) notFound();

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

  return (
    <MixerDetail
      eventId={eventId}
      mixer={mixer}
      participants={participants}
      plan={plan}
      allAttendees={attendees}
      existingAttendeeIds={[...existingIds]}
    />
  );
}
