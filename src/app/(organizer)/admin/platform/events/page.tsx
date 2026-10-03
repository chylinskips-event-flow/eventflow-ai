import { auditLog, requireSuperAdmin } from "@/lib/platform-admin";
import { listEvents } from "@/lib/platform-data";
import { PlatformEventTable } from "../event-table";

export default async function PlatformEventsPage() {
  const actor = await requireSuperAdmin();
  const events = await listEvents();
  await auditLog(actor, "view_events", { type: "platform" }, { count: events.length });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Eventy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {events.length} eventów (bez usuniętych). Zawieszony event znika z publicznego dostępu.
        </p>
      </div>
      <PlatformEventTable events={events} />
    </>
  );
}
