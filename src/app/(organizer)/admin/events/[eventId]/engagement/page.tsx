import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ChevronRight, MessageCircleQuestion, Star } from "lucide-react";
import { getOwnEvent } from "@/lib/events";
import { featureGate } from "@/lib/entitlements";
import { getEventSessions } from "@/lib/sessions";
import { getEventEngagementSummary } from "@/lib/engagement";
import { formatDay, formatTimeRange } from "@/lib/format";
import { FeatureLockedPage } from "@/components/upgrade-notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function EngagementPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) notFound();
  const gate = await featureGate(event.organization_id, "live_qa");
  if (!gate.ok) return <FeatureLockedPage title="Q&A i ankiety" message={gate.message} />;

  const [sessions, summary] = await Promise.all([
    getEventSessions(eventId),
    getEventEngagementSummary(eventId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Q&amp;A i ankiety</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pytania uczestników, ankiety na żywo i oceny — osobno dla każdej sesji agendy.
          Uczestnicy znajdą je po kliknięciu sesji w agendzie.
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Dodaj sesje w zakładce Agenda — Q&amp;A działa dla każdej z nich.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => {
            const sum = summary.get(s.id);
            const time = formatTimeRange(s.starts_at, s.ends_at, event.timezone);
            return (
              <li key={s.id}>
                <Link href={`/admin/events/${eventId}/engagement/${s.id}`}>
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{s.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.starts_at ? `${formatDay(s.starts_at, event.timezone)}${time ? `, ${time}` : ""}` : "Bez daty"}
                          {s.room ? ` · ${s.room}` : ""}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MessageCircleQuestion className="size-3.5" />
                            {sum?.visible_questions ?? 0} pytań
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3.5" />
                            {sum?.avg_rating != null ? `${sum.avg_rating.toFixed(1)} (${sum.ratings})` : "brak ocen"}
                          </span>
                          {(sum?.open_polls ?? 0) > 0 && (
                            <Badge variant="success" className="gap-1">
                              <BarChart3 className="size-3" />
                              ankieta otwarta
                            </Badge>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
