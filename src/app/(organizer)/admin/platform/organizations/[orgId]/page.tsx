import { notFound } from "next/navigation";
import { auditLog, requireSuperAdmin } from "@/lib/platform-admin";
import { getOrganization, getPlans, listEvents } from "@/lib/platform-data";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlatformActionForm } from "../../action-form";
import {
  removePlanOverride,
  setPlanOverride,
  suspendOrganization,
  unsuspendOrganization,
} from "../../actions";
import { PlatformEventTable } from "../../event-table";
import { PlanBadge, formatDate } from "../../plan-badge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUB_STATUS: Record<string, string> = {
  trialing: "okres próbny",
  active: "aktywna",
  past_due: "zaległa płatność",
  canceled: "anulowana",
  incomplete: "niedokończona",
  unpaid: "nieopłacona",
};

export default async function PlatformOrganizationPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const actor = await requireSuperAdmin();
  const { orgId } = await params;
  if (!UUID.test(orgId)) notFound();

  const [org, plans, events] = await Promise.all([
    getOrganization(orgId),
    getPlans(),
    listEvents(orgId),
  ]);
  if (!org) notFound();
  await auditLog(actor, "view_organization", { type: "organization", id: org.id });

  const override = org.override;
  const commission = override?.limits?.ticket_commission_pct;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {org.owner_email ?? "—"} · zarejestrowana {formatDate(org.created_at)} · {org.event_count}{" "}
            eventów
          </p>
        </div>
        {org.suspension && <Badge variant="destructive">Konto zawieszone</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Efektywny plan</CardTitle>
            <CardDescription>Override → subskrypcja Stripe → Free.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <PlanBadge plan={org.effective} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Subskrypcja Stripe</dt>
              <dd>
                {org.subscription
                  ? `${org.subscription.plan_key} — ${SUB_STATUS[org.subscription.status] ?? org.subscription.status}` +
                    (org.subscription.current_period_end &&
                    ["trialing", "active", "past_due"].includes(org.subscription.status)
                      ? `, do ${formatDate(org.subscription.current_period_end)}`
                      : "")
                  : "brak"}
              </dd>
              <dt className="text-muted-foreground">Override</dt>
              <dd>
                {override
                  ? `${override.plan_key ?? "bez zmiany planu"}` +
                    (override.expires_at ? `, do ${formatDate(override.expires_at)}` : ", bezterminowo") +
                    (commission != null ? `, prowizja ${commission}%` : "")
                  : "brak"}
              </dd>
              {override?.reason && (
                <>
                  <dt className="text-muted-foreground">Powód</dt>
                  <dd>{override.reason}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{override ? "Zmień override" : "Nadaj override"}</CardTitle>
            <CardDescription>
              Grandfathering / comp / trial. Wygrywa z subskrypcją Stripe; webhook go nie nadpisuje.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PlatformActionForm
              action={setPlanOverride.bind(null, org.id)}
              submitLabel={override ? "Zapisz override" : "Nadaj override"}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="plan_key">Plan</Label>
                <select
                  id="plan_key"
                  name="plan_key"
                  defaultValue={override?.plan_key ?? ""}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">— bez zmiany planu (tylko prowizja) —</option>
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                      {p.is_active ? "" : " (nieaktywny)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="expires_at">Ważny do (opcjonalnie)</Label>
                  <Input
                    id="expires_at"
                    name="expires_at"
                    type="date"
                    defaultValue={override?.expires_at?.slice(0, 10) ?? ""}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ticket_commission_pct">Prowizja od biletów % (opcjonalnie)</Label>
                  <Input
                    id="ticket_commission_pct"
                    name="ticket_commission_pct"
                    inputMode="decimal"
                    placeholder="z planu"
                    defaultValue={commission ?? ""}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reason">Powód / notatka</Label>
                <Input
                  id="reason"
                  name="reason"
                  required
                  maxLength={500}
                  placeholder="np. pilot — grandfathering"
                  defaultValue={override?.reason ?? ""}
                />
              </div>
            </PlatformActionForm>

            {override && (
              <PlatformActionForm
                action={removePlanOverride.bind(null, org.id)}
                submitLabel="Zdejmij override"
                variant="outline"
                confirm="Zdjąć override? Organizacja wróci pod subskrypcję Stripe / Free."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Zawieszenie konta</CardTitle>
          <CardDescription>
            Zawieszony organizator nie może korzystać z panelu, a jego eventy znikają z publicznego
            dostępu. Dane zostają.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {org.suspension ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Zawieszone {formatDate(org.suspension.created_at)}
                {org.suspension.reason ? ` — ${org.suspension.reason}` : ""}
              </p>
              <PlatformActionForm
                action={unsuspendOrganization.bind(null, org.id)}
                submitLabel="Odwieś konto"
                variant="outline"
              />
            </div>
          ) : (
            <PlatformActionForm
              action={suspendOrganization.bind(null, org.id)}
              submitLabel="Zawieś konto"
              variant="destructive"
              confirm={`Zawiesić konto „${org.name}”? Organizator straci dostęp, a eventy znikną publicznie.`}
            >
              <Input name="reason" placeholder="Powód zawieszenia" required maxLength={500} />
            </PlatformActionForm>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Eventy</h2>
        <PlatformEventTable events={events} showOrganization={false} />
      </section>
    </>
  );
}
