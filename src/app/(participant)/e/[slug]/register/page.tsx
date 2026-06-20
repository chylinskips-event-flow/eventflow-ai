import {
  getEventBySlugForRegistration,
  getRegistrationUnavailableReason,
} from "@/lib/events";
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

  return <RegisterForm event={event} />;
}
