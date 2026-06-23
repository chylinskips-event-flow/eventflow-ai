import { getEventBySlugForRegistration } from "@/lib/events";
import { getTemplate, applyVariables } from "@/lib/message-templates";
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

  const templateType = isPending ? "welcome_pending" : "welcome_approved";
  const template = await getTemplate(event?.id ?? "", templateType);
  const body = applyVariables(template.body, {
    imię: name ?? "",
    nazwa_eventu: eventName,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {isPending ? "Zgłoszenie przyjęte!" : "Zarejestrowano!"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className="text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        </CardContent>
      </Card>
    </main>
  );
}
