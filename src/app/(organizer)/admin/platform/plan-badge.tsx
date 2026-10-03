import { Badge } from "@/components/ui/badge";
import type { EffectivePlan } from "@/lib/platform-data";

const SOURCE_LABEL: Record<EffectivePlan["source"], string> = {
  override: "override",
  subscription: "Stripe",
  default: "domyślny",
  billing_disabled: "brak konfiguracji",
};

/** Efektywny plan organizacji + skąd wynika (override / Stripe / domyślny Free). */
export function PlanBadge({ plan }: { plan: EffectivePlan }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="indigo">{plan.planName ?? "—"}</Badge>
      <Badge variant={plan.source === "override" ? "warning" : "outline"}>
        {SOURCE_LABEL[plan.source]}
      </Badge>
      {plan.overrideExpired && <Badge variant="secondary">override wygasł</Badge>}
    </span>
  );
}

export function formatDate(iso: string | null | undefined) {
  return iso
    ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(new Date(iso))
    : "—";
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));
}
