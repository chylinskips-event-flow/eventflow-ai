"use client";

import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type DayOption = { key: string; label: string };

export function DaySelector({
  days,
  active,
}: {
  days: DayOption[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function select(key: string) {
    const params = new URLSearchParams();
    if (key !== "all") params.set("day", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {days.map((d) => (
        <button
          key={d.key}
          onClick={() => select(d.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            d.key === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
