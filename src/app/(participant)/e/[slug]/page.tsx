import Link from "next/link";
import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
} from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dateRangeFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ParticipantEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlugForRegistration(slug);

  if (!event) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Wydarzenie nie zostało znalezione</CardTitle>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // Zatwierdzony uczestnik ma dostęp niezależnie od późniejszej zmiany statusu
  // eventu (completed/archived) - celowe. Po evencie uczestnicy mają widzieć
  // listę poznanych osób i rekomendacje kontaktów (moduł post-event/networking,
  // patrz plan produktu) - to wymaga zachowania dostępu po zakończeniu eventu,
  // nie tylko w trakcie.
  const attendee = await getCurrentAttendee(slug);

  if (attendee) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Cześć, {attendee.first_name}!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Tu będzie Twój panel uczestnika — {event.name}.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const unavailableReason = getRegistrationUnavailableReason(event);

  if (unavailableReason) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{event.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{unavailableReason}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{event.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {event.starts_at && (
            <p className="text-sm text-muted-foreground">
              {dateRangeFormatter.format(new Date(event.starts_at))}
              {event.ends_at &&
                ` – ${dateRangeFormatter.format(new Date(event.ends_at))}`}
            </p>
          )}
          {event.location && (
            <p className="text-sm text-muted-foreground">{event.location}</p>
          )}
          <Button asChild size="lg">
            <Link href={`/e/${slug}/register`}>Zarejestruj się</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
