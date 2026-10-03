import Link from "next/link";
import { auditLog, requireSuperAdmin } from "@/lib/platform-admin";
import { listOrganizations } from "@/lib/platform-data";
import { Badge } from "@/components/ui/badge";
import { PlanBadge, formatDate } from "./plan-badge";

export default async function PlatformOrganizationsPage() {
  const actor = await requireSuperAdmin();
  const organizations = await listOrganizations();
  await auditLog(actor, "view_organizations", { type: "platform" }, { count: organizations.length });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Organizacje</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organizations.length} organizacji. Efektywny plan: override → subskrypcja Stripe → Free.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Organizacja</th>
              <th className="px-4 py-2 font-medium">Właściciel</th>
              <th className="px-4 py-2 font-medium">Rejestracja</th>
              <th className="px-4 py-2 font-medium text-right">Eventy</th>
              <th className="px-4 py-2 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {organizations.map((o) => (
              <tr key={o.id} className="align-top">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/platform/organizations/${o.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {o.name}
                  </Link>
                  {o.suspension && (
                    <Badge variant="destructive" className="ml-2">
                      zawieszona
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{o.owner_email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{o.event_count}</td>
                <td className="px-4 py-3">
                  <PlanBadge plan={o.effective} />
                </td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Brak organizacji.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
