import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEventBySlugForRegistration } from "@/lib/events";
import { getCurrentAttendee } from "@/lib/attendee-session";
import { getOrigin } from "@/lib/request-origin";
import { buildEventInternalPath } from "@/lib/event-url";
import { getAttendeeByContactCode } from "@/lib/contact-requests";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectButton } from "./connect-button";

function Notice({
  href,
  message,
  cta,
}: {
  href: string;
  message: string;
  cta?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-muted-foreground">{message}</p>
          <Button asChild>
            <Link href={href}>{cta ?? "Wróć do wydarzenia"}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function ConnectPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const origin = getOrigin(await headers());
  const eventRoot = buildEventInternalPath(slug, "", origin) || "/";

  const event = await getEventBySlugForRegistration(slug);
  if (!event) {
    redirect(eventRoot);
  }

  const scanner = await getCurrentAttendee(slug);
  if (!scanner) {
    return (
      <Notice
        href={eventRoot}
        message="Aby nawiązać kontakt, wejdź najpierw przez swój link wejściowy."
        cta="Przejdź do wydarzenia"
      />
    );
  }

  const owner = await getAttendeeByContactCode(code, scanner.event_id);
  if (!owner) {
    return <Notice href={eventRoot} message="Nieprawidłowy kod." />;
  }

  if (owner.id === scanner.id) {
    return <Notice href={eventRoot} message="To Twój kod." />;
  }

  const fullName = [owner.first_name, owner.last_name].filter(Boolean).join(" ");
  const initials = [owner.first_name?.[0], owner.last_name?.[0]]
    .filter(Boolean)
    .join("");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Nawiąż kontakt</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <Avatar className="h-20 w-20">
            {owner.avatar_url && (
              <AvatarImage src={owner.avatar_url} alt={fullName} />
            )}
            <AvatarFallback className="text-xl">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">
              {fullName || "Uczestnik"}
            </span>
            {owner.company && (
              <span className="text-sm text-muted-foreground">
                {owner.company}
              </span>
            )}
          </div>
          {/* Email świadomie NIE tutaj — ujawnia się dopiero po nawiązaniu, na
              /contacts. Ta strona pokazuje tylko kto to. */}
          <ConnectButton slug={slug} code={code} />
        </CardContent>
      </Card>
    </main>
  );
}
