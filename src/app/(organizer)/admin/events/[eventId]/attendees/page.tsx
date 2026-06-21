import { notFound } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import { getEventAttendees, type Attendee } from "@/lib/attendees";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AttendeeActions } from "./attendee-actions";

const STATUS_LABELS: Record<Attendee["status"], string> = {
  pending: "Oczekuje",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

const STATUS_CLASSES: Record<Attendee["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function attendeeName(attendee: Attendee) {
  return [attendee.first_name, attendee.last_name].filter(Boolean).join(" ") || "—";
}

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

      {attendees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Nikt się jeszcze nie zarejestrował na ten event.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {attendees.map((attendee) => (
            <Card key={attendee.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{attendeeName(attendee)}</span>
                  <span className="text-sm text-muted-foreground">
                    {attendee.email}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={cn(STATUS_CLASSES[attendee.status])}>
                    {STATUS_LABELS[attendee.status]}
                  </Badge>
                  {attendee.status === "pending" && (
                    <AttendeeActions eventId={eventId} attendeeId={attendee.id} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
