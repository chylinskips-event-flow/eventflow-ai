import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnOrganization } from "@/lib/organizations";
import { getOrganizationEvents, type Event } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) {
    return "Termin nieustalony";
  }

  const formatter = new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const start = formatter.format(new Date(startsAt));

  if (!endsAt) {
    return start;
  }

  return `${start} – ${formatter.format(new Date(endsAt))}`;
}

export default async function OrganizerAdminPage() {
  const organization = await getOwnOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const events = await getOrganizationEvents(organization.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{organization.name}</h1>
        <Button asChild>
          <Link href="/admin/events/new">Nowy event</Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">
              Nie masz jeszcze żadnych eventów.
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
                      {formatDateRange(event.starts_at, event.ends_at)}
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
  );
}
