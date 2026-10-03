import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { getQaProjectorState } from "@/lib/engagement";
import { getOrigin } from "@/lib/request-origin";
import { buildEventApexUrl } from "@/lib/event-url";
import { QaProjectorView } from "./qa-projector-view";

// Ekran rzutnika Q&A sesji — publiczny, tylko do odczytu; dostęp = znajomość tokenu
// (jak rzutnik Business Mixera). Zawieszony event / organizacja → 404.

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const state = await getQaProjectorState(token);
  return {
    title: state ? `${state.sessionTitle} — Q&A` : "Q&A",
    robots: { index: false, follow: false },
  };
}

export default async function QaProjectorPage({ params }: Props) {
  const { token } = await params;
  const state = await getQaProjectorState(token);
  if (!state) notFound();

  const origin = getOrigin(await headers());
  const joinUrl = `${buildEventApexUrl(state.eventSlug, origin)}/agenda/${state.sessionId}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 360 });

  return <QaProjectorView state={state} joinUrl={joinUrl} qrDataUrl={qrDataUrl} />;
}
