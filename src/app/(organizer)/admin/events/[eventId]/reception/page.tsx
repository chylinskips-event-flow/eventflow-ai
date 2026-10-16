import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getReceptionList } from "@/lib/reception";
import { getOrigin } from "@/lib/request-origin";
import { ReceptionPanel } from "@/components/reception-panel";
import { PageShell } from "@/components/page-shell";
import { ReceptionTokenSection } from "./reception-token-section";
import {
  organizerCheckInByQr,
  organizerCheckInById,
  organizerUndoCheckIn,
} from "./actions";

export default async function ReceptionPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const [event, attendees, origin] = await Promise.all([
    getOwnEvent(eventId),
    getReceptionList(eventId),
    headers().then(getOrigin),
  ]);

  if (!event) notFound();

  const checkInByQr = organizerCheckInByQr.bind(null, eventId);
  const checkInById = organizerCheckInById.bind(null, eventId);
  const undoCheckIn = organizerUndoCheckIn.bind(null, eventId);

  // Wspólna rama panelu organizatora (tytuł, szerokość). Bez zakładek: recepcja to jedno narzędzie
  // (licznik, skan QR, szukajka, filtry, lista) — kolejne kliknięcia tylko by spowalniały check-in.
  // Panel ma własne marginesy (wspólny z publiczną stroną recepcji), więc znosimy marginesy ramy.
  return (
    <PageShell title="Recepcja">
      <div className="-mx-4 sm:-mx-6">
        <ReceptionPanel
          attendees={attendees}
          checkInByQrAction={checkInByQr}
          checkInByIdAction={checkInById}
          undoCheckInAction={undoCheckIn}
          stickyTopClass="top-14"
          receptionLinkSlot={
            <ReceptionTokenSection
              compact
              eventId={eventId}
              receptionToken={event.reception_token}
              eventSlug={event.slug}
              origin={origin}
            />
          }
        />
      </div>
    </PageShell>
  );
}
