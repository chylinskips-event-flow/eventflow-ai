import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
} from "@/lib/events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
});

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
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Rejestracja
        </p>
        <h1 className="mt-1 text-2xl font-bold text-primary">{event.name}</h1>
        {event.starts_at && (
          <p className="mt-1 text-sm text-muted-foreground">
            {dateFormatter.format(new Date(event.starts_at))}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Zarejestruj się, aby wziąć udział w wydarzeniu.
        </p>
      </div>
      <RegisterForm event={event} />
    </main>
  );
}
