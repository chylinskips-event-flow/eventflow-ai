import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  computeLevel,
  computeNextLevelThreshold,
  LEVEL_LABELS,
} from "@/lib/gamification";
import type { GamificationLevel } from "@/lib/gamification";
import { cn } from "@/lib/utils";

const LEVEL_VARIANT: Record<
  GamificationLevel,
  "secondary" | "success" | "indigo" | "warning"
> = {
  explorer:   "secondary",
  connector:  "success",
  networker:  "indigo",
  ambassador: "warning",
};

const LEVEL_FLOOR: Record<GamificationLevel, number> = {
  explorer:   0,
  connector:  100,
  networker:  250,
  ambassador: 500,
};

export function PointsLevelWidget({
  points,
  rankingHref,
  className,
}: {
  points: number;
  rankingHref?: string;
  className?: string;
}) {
  const level = computeLevel(points);
  const variant = LEVEL_VARIANT[level];
  const next = computeNextLevelThreshold(points);
  const floor = LEVEL_FLOOR[level];

  const pct =
    next !== null
      ? Math.min(100, Math.round(((points - floor) / (next - floor)) * 100))
      : 100;

  const inner = (
    <div
      className={cn(
        "flex flex-col gap-2",
        rankingHref && "cursor-pointer transition-opacity hover:opacity-80",
        className,
      )}
    >
      {/* Points pill + level badge */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-coral px-3 py-1 text-sm font-bold tabular-nums text-[#171A2B]">
          {points} pkt
        </span>
        <Badge variant={variant}>{LEVEL_LABELS[level]}</Badge>
      </div>

      {/* Progress bar — hidden at Ambassador (max level) */}
      {next !== null && (
        <div className="flex flex-col gap-0.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {points} / {next} pkt → {LEVEL_LABELS[computeLevel(next)]}
          </span>
        </div>
      )}
    </div>
  );

  if (rankingHref) {
    return <Link href={rankingHref}>{inner}</Link>;
  }
  return inner;
}
