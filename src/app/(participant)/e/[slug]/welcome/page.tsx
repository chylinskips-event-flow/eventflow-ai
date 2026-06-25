import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getTemplate, applyVariables } from "@/lib/message-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <main className="flex flex-col items-center px-4 py-12 md:py-20">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div
            className={`flex size-12 items-center justify-center rounded-full ${
              isPending
                ? "bg-amber-100 text-amber-700"
                : "bg-primary/10 text-primary"
            }`}
          >
            {isPending ? (
              <Clock className="size-6" />
            ) : (
              <CheckCircle2 className="size-6" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold text-primary">
            {isPending ? "Zgłoszenie przyjęte!" : "Zarejestrowano!"}
          </CardTitle>
          {isPending && (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              <Clock className="size-3" />
              Oczekuje na zatwierdzenie
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <p
            className="text-base leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: body }}
          />
          <Button asChild variant="outline" className="w-full">
            <Link href={`/e/${slug}`}>Wróć do strony wydarzenia</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
