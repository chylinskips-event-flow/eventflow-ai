import Link from "next/link";
import { Building2 } from "lucide-react";
import type { Partner } from "@/lib/partners";
import { partnerTierLabel } from "@/lib/partner-options";
import { groupByTier } from "@/lib/moderator-core";
import { cn } from "@/lib/utils";

/** Logotypy partnerów pogrupowane wg poziomu; kafel prowadzi do profilu partnera. */
export function PartnerGrid({ partners, hrefFor }: { partners: Partner[]; hrefFor: (id: string) => string }) {
  const groups = groupByTier(partners);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => {
        const big = g.tier === "gold";
        return (
          <div key={g.tier ?? "none"} className="flex flex-col gap-3">
            {groups.length > 1 && (
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {partnerTierLabel(g.tier) ?? "Partnerzy"}
              </h3>
            )}
            <ul className={cn("grid gap-3", big ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
              {g.items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={hrefFor(p.id)}
                    className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-colors hover:bg-muted/50"
                  >
                    <span className={cn("flex w-full items-center justify-center", big ? "h-20" : "h-14")}>
                      {p.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.logo_url} alt={p.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Building2 className="size-8 text-muted-foreground" />
                      )}
                    </span>
                    <span className="text-sm font-medium">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
