import { getEventBySlugForRegistration } from "@/lib/events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string; status?: string }>;
}) {
  const { slug } = await params;
  const { name, status } = await searchParams;
  const event = await getEventBySlugForRegistration(slug);

  const eventName = event ? event.name : "tym wydarzeniu";
  const isPending = status === "pending";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {isPending ? "Zgłoszenie przyjęte!" : "Zarejestrowano!"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {isPending ? (
              <>
                Dziękujemy za zgłoszenie! Twoja rejestracja na {eventName}{" "}
                oczekuje na zatwierdzenie przez organizatora. Otrzymasz email,
                gdy zostanie zaakceptowana.
              </>
            ) : (
              <>
                {name ? `${name}, ` : ""}cieszymy się, że będziesz z nami na{" "}
                {eventName}.
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
