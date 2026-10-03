import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { PlatformEvent } from "@/lib/platform-data";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlatformActionForm } from "./action-form";
import { suspendEvent, unsuspendEvent } from "./actions";
import { formatDate } from "./plan-badge";

const STATUS_LABELS: Record<string, string> = {
  draft: "Szkic",
  published: "Opublikowany",
  live: "Na żywo",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};

/** Tabela eventów z zawieszaniem — używana na liście eventów i w szczegółach organizacji. */
export function PlatformEventTable({
  events,
  showOrganization = true,
}: {
  events: PlatformEvent[];
  showOrganization?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Event</th>
            {showOrganization && <th className="px-4 py-2 font-medium">Organizacja</th>}
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium text-right">Uczestnicy</th>
            <th className="px-4 py-2 font-medium text-right">Bilety</th>
            <th className="px-4 py-2 font-medium">Moderacja</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="px-4 py-3">
                <a
                  href={`/e/${e.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                >
                  {e.name}
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </a>
                <div className="text-xs text-muted-foreground">{formatDate(e.starts_at)}</div>
              </td>
              {showOrganization && (
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/platform/organizations/${e.organization_id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {e.organization_name}
                  </Link>
                </td>
              )}
              <td className="px-4 py-3">{STATUS_LABELS[e.status] ?? e.status}</td>
              <td className="px-4 py-3 text-right tabular-nums">{e.attendees}</td>
              <td className="px-4 py-3 text-right tabular-nums">{e.tickets}</td>
              <td className="px-4 py-3">
                {e.suspension ? (
                  <div className="flex flex-col gap-2">
                    <span>
                      <Badge variant="destructive">zawieszony</Badge>
                      <span className="ml-2 text-xs text-muted-foreground">{e.suspension.reason}</span>
                    </span>
                    <PlatformActionForm
                      action={unsuspendEvent.bind(null, e.id)}
                      submitLabel="Przywróć"
                      variant="outline"
                    />
                  </div>
                ) : e.organization_suspended ? (
                  <span className="text-xs text-muted-foreground">
                    Niedostępny — organizacja zawieszona
                  </span>
                ) : (
                  <PlatformActionForm
                    action={suspendEvent.bind(null, e.id)}
                    submitLabel="Zawieś"
                    variant="destructive"
                    confirm={`Zawiesić event „${e.name}”? Strona publiczna przestanie działać.`}
                  >
                    <Input name="reason" placeholder="Powód zawieszenia" required maxLength={500} />
                  </PlatformActionForm>
                )}
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={showOrganization ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                Brak eventów.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
