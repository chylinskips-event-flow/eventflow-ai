import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { computeLevel, LEVEL_LABELS } from "@/lib/gamification";
import type { GamificationLevel } from "@/lib/gamification";
import { cn } from "@/lib/utils";

const LEVEL_VARIANT: Record<GamificationLevel, "secondary" | "success" | "indigo" | "warning"> = {
  explorer:   "secondary",
  connector:  "success",
  networker:  "indigo",
  ambassador: "warning",
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

  const inner = (
    <div
      className={cn(
        "flex items-center gap-2",
        rankingHref && "cursor-pointer transition-opacity hover:opacity-80",
        className,
      )}
    >
      <span className="rounded-full bg-coral px-3 py-1 text-sm font-bold tabular-nums text-[#171A2B]">
        {points} pkt
      </span>
      <Badge variant={variant}>{LEVEL_LABELS[level]}</Badge>
    </div>
  );

  if (rankingHref) {
    return <Link href={rankingHref}>{inner}</Link>;
  }
  return inner;
}
