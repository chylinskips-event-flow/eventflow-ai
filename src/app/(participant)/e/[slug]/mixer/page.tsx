import { redirect } from "next/navigation";
import { getMixerForAttendee } from "@/lib/mixer/participant";
import { LiveMixerView } from "./live-mixer-view";

export default async function ParticipantMixerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mixer = await getMixerForAttendee(slug);

  if (!mixer) redirect(`/e/${slug}`);

  return <LiveMixerView mixer={mixer} slug={slug} />;
}
