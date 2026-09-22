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
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<Event["status"], string> = {
  draft: "Szkic",
  published: "Opublikowany",
  live: "Na żywo",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};

const STATUS_CLASSES: Record<Event["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  live: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse",
  completed: "bg-muted text-muted-foreground line-through",
  archived: "bg-muted text-muted-foreground",
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
          <h1 className="text-2xl font-semibold">{organization.name}</h1>
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
                    <Badge className={cn(STATUS_CLASSES[event.status])}>
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
