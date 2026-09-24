import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMixerLiveState } from "@/lib/mixer/getters";
import { ProjectorView } from "./projector-view";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const state = await getMixerLiveState(token);
  return {
    title: state ? `${state.mixerName} — rzutnik` : "Rzutnik",
    robots: { index: false, follow: false },
  };
}

export default async function ProjectorPage({ params }: Props) {
  const { token } = await params;
  const state = await getMixerLiveState(token);
  if (!state) notFound();
  return <ProjectorView state={state} />;
}
