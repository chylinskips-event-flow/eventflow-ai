import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnOrganization } from "@/lib/organizations";
import { getOrganizationEvents, type Event } from "@/lib/events";
import { signOut } from "../actions";
import { formatDateTimeRange } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";

const STATUS_LABELS: Record<Event["status"], string> = {
  draft: "Szkic",
  published: "Opublikowany",
  live: "Na żywo",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};

const STATUS_VARIANTS: Record<Event["status"], "secondary" | "success" | "indigo"> = {
  draft: "secondary",
  published: "success",
  live: "indigo",
  completed: "secondary",
  archived: "secondary",
};

const STATUS_LIVE: Record<Event["status"], boolean> = {
  draft: false, published: false, live: true, completed: false, archived: false,
};

function formatDateRange(
  startsAt: string | null,
  endsAt: string | null,
  timeZone: string | null,
) {
  return formatDateTimeRange(startsAt, endsAt, timeZone) ?? "Termin nieustalony";
}

export default async function OrganizerAdminPage() {
  const [organization, supabase] = await Promise.all([
    getOwnOrganization(),
    createClient(),
  ]);

  if (!organization) {
    redirect("/onboarding");
  }

  const { data: { user } } = await supabase.auth.getUser();
  const events = await getOrganizationEvents(organization.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <Logo variant="full" />
        <div className="flex items-center gap-4">
          {user?.email && (
            <span className="text-sm text-muted-foreground">{user.email}</span>
          )}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Wyloguj
            </Button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Twoje wydarzenia</h1>
          <Button asChild>
            <Link href="/admin/events/new">Nowe wydarzenie</Link>
          </Button>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-muted-foreground">
                Nie masz jeszcze żadnych wydarzeń.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((event) => (
              <Link key={event.id} href={`/admin/events/${event.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{event.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDateRange(event.starts_at, event.ends_at, event.timezone)}
                      </span>
                    </div>
                    <Badge
                      variant={STATUS_VARIANTS[event.status]}
                      className={STATUS_LIVE[event.status] ? "animate-pulse" : undefined}
                    >
                      {STATUS_LABELS[event.status]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
