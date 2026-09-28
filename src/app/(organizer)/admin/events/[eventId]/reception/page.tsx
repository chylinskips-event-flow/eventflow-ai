import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getReceptionList } from "@/lib/reception";
import { getOrigin } from "@/lib/request-origin";
import { ReceptionPanel } from "@/components/reception-panel";
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

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-xl font-semibold">Recepcja</h1>

      <div className="flex flex-col gap-4">
        <ReceptionPanel
          attendees={attendees}
          checkInByQrAction={checkInByQr}
          checkInByIdAction={checkInById}
          undoCheckInAction={undoCheckIn}
        />

        <hr className="my-2" />

        <ReceptionTokenSection
          eventId={eventId}
          receptionToken={event.reception_token}
          eventSlug={event.slug}
          origin={origin}
        />
      </div>
    </div>
  );
}
