import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventAttendees } from "@/lib/attendees";
import { AttendeeList } from "./attendee-list";

export default async function EventAttendeesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  // Sortowanie: najnowsze zgłoszenia na górze (getEventAttendees już sortuje
  // po created_at desc). Bez paginacji na tym etapie — przy większej skali
  // (setki/tysiące uczestników na event) warto rozważyć ją w przyszłości,
  // ale dla MVP to prawdopodobnie nie jest jeszcze problem.
  const attendees = await getEventAttendees(eventId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Uczestnicy</h1>
      <AttendeeList eventId={eventId} attendees={attendees} />
    </main>
  );
}
