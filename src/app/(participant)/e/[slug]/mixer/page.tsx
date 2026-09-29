import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMixerForAttendee } from "@/lib/mixer/participant";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { LiveMixerView } from "./live-mixer-view";

export default async function ParticipantMixerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";
  const mixer = await getMixerForAttendee(slug);

  if (!mixer) redirect(eventRoot);

  return <LiveMixerView mixer={mixer} slug={slug} backHref={eventRoot} />;
}
