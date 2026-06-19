import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { EventEditForm } from "./form";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);

  if (!event) {
    notFound();
  }

  return <EventEditForm event={event} />;
}
