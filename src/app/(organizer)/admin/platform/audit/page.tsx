import { requireSuperAdmin } from "@/lib/platform-admin";
import { listAuditLog } from "@/lib/platform-data";
import { formatDateTime } from "../plan-badge";

const ACTION_LABELS: Record<string, string> = {
  view_organizations: "Podgląd listy organizacji",
  view_events: "Podgląd listy eventów",
  view_organization: "Podgląd organizacji",
  set_plan_override: "Nadanie / zmiana override planu",
  remove_plan_override: "Zdjęcie override planu",
  suspend_organization: "Zawieszenie konta",
  unsuspend_organization: "Odwieszenie konta",
  suspend_event: "Zawieszenie eventu",
  unsuspend_event: "Przywrócenie eventu",
};

export default async function PlatformAuditPage() {
  await requireSuperAdmin();
  const entries = await listAuditLog(200);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Audyt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ostatnie 200 akcji operatorów.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Kiedy</th>
              <th className="px-4 py-2 font-medium">Kto</th>
              <th className="px-4 py-2 font-medium">Akcja</th>
              <th className="px-4 py-2 font-medium">Cel</th>
              <th className="px-4 py-2 font-medium">Szczegóły</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {formatDateTime(e.created_at)}
                </td>
                <td className="px-4 py-2">{e.actor_email ?? "—"}</td>
                <td className="px-4 py-2">{ACTION_LABELS[e.action] ?? e.action}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {e.target_type}
                  {e.target_id ? `:${e.target_id}` : ""}
                </td>
                <td className="max-w-[360px] px-4 py-2">
                  <code className="break-all text-xs text-muted-foreground">
                    {JSON.stringify(e.details)}
                  </code>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Brak wpisów.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
