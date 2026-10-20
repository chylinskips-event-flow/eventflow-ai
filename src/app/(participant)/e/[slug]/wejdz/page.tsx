import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { isAccessLinkAvailable, ACCESS_LINK_UNAVAILABLE_MESSAGE } from "@/lib/access-link-core";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessLinkForm } from "./access-link-form";

export const metadata: Metadata = { title: "Wejdź ponownie", robots: { index: false } };

export default async function AccessLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";

  const [event, attendee] = await Promise.all([
    getEventBySlugForRegistration(slug),
    getCurrentAttendee(slug),
  ]);
  // Na tym urządzeniu uczestnik jest już zalogowany — prosto do panelu.
  if (event && attendee) redirect(eventRoot);

  const available = isAccessLinkAvailable(event);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {available && event && <p className="text-sm text-muted-foreground">{event.name}</p>}
          <CardTitle>Wejdź ponownie</CardTitle>
          {available && (
            <CardDescription>
              Podaj adres e-mail użyty przy rejestracji — wyślemy na niego link do Twojego panelu
              uczestnika. Hasło nie jest potrzebne.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {available ? (
            <AccessLinkForm slug={slug} />
          ) : (
            <p className="text-muted-foreground">{ACCESS_LINK_UNAVAILABLE_MESSAGE}</p>
          )}
          {available && (
            <Link
              href={eventRoot}
              className="inline-flex min-h-11 items-center justify-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Wróć do strony wydarzenia
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
