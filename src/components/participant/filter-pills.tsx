"use client";

import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type TierFilter = "all" | "0-100" | "101-300" | "301-500" | "500+";

const PILLS: { label: string; value: TierFilter }[] = [
  { label: "Wszystkie", value: "all" },
  { label: "do 100",    value: "0-100" },
  { label: "101–300",   value: "101-300" },
  { label: "301–500",   value: "301-500" },
  { label: "500+",      value: "500+" },
];

export function FilterPills({
  active,
  className,
}: {
  active: TierFilter;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function select(value: TierFilter) {
    const params = new URLSearchParams();
    if (value !== "all") params.set("tier", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PILLS.map((pill) => (
        <button
          key={pill.value}
          onClick={() => select(pill.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            pill.value === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}
