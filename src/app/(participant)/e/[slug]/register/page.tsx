import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
  DEFAULT_INTEREST_OPTIONS,
} from "@/lib/events";
import { Calendar } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <Badge variant="secondary" className="w-fit">
          REJESTRACJA
        </Badge>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        {event.starts_at && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="size-4 shrink-0" />
            {formatDate(event.starts_at, event.timezone)}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Zarejestruj się, aby wziąć udział w wydarzeniu.
        </p>
      </div>
      <RegisterForm
        event={event}
        interestOptions={event.interest_options ?? DEFAULT_INTEREST_OPTIONS}
      />
    </main>
  );
}
