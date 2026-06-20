import { getEventBySlugForRegistration } from "@/lib/events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { slug } = await params;
  const { name } = await searchParams;
  const event = await getEventBySlugForRegistration(slug);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Zarejestrowano!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {name ? `${name}, ` : ""}cieszymy się, że będziesz z nami na{" "}
            {event ? event.name : "tym wydarzeniu"}.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
