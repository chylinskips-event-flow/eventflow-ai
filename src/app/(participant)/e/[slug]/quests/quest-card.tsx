import type { LucideIcon } from "lucide-react";
import { CheckCircle2, KeyRound, MapPin, Trophy, Users, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TileConfig = { icon: LucideIcon; tileCls: string; iconCls: string };

const TYPE_TILE: Record<string, TileConfig> = {
  profile_complete:    { icon: User,     tileCls: "bg-primary/10", iconCls: "text-primary"   },
  networking_contacts: { icon: Users,    tileCls: "bg-aqua/10",    iconCls: "text-aqua"       },
  booth_visit:         { icon: MapPin,   tileCls: "bg-coral/10",   iconCls: "text-[#171A2B]" },
  booth_quiz:          { icon: Trophy,   tileCls: "bg-coral/10",   iconCls: "text-[#171A2B]" },
  booth_password:      { icon: KeyRound, tileCls: "bg-coral/10",   iconCls: "text-[#171A2B]" },
};
const FALLBACK_TILE: TileConfig = TYPE_TILE.booth_visit;

const TYPE_LABELS: Record<string, string> = {
  booth_visit:         "Odwiedziny stoiska",
  booth_quiz:          "Quiz przy stoisku",
  booth_password:      "Hasło przy stoisku",
  networking_contacts: "Networking",
  profile_complete:    "Profil",
};

export function QuestCard({
  type,
  title,
  description,
  pointsValue,
  partnerName,
  boothLocation,
  targetValue,
  done,
}: {
  type: string;
  title: string;
  description: string | null;
  pointsValue: number | null;
  partnerName: string | null;
  boothLocation: string | null;
  targetValue: number | null;
  done: boolean;
}) {
  const tile = TYPE_TILE[type] ?? FALLBACK_TILE;
  const TileIcon = tile.icon;

  return (
    <Card className={cn(
      "transition-colors",
      done && "border-aqua/40 opacity-75",
    )}>
      <CardContent className="flex items-start gap-3 py-4">
        {/* Kolorowy kafelek ikony */}
        <div className={cn(
          "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
          done ? "bg-aqua/10" : tile.tileCls,
        )}>
          {done ? (
            <CheckCircle2 className="size-5 text-aqua" />
          ) : (
            <TileIcon className={cn("size-5", tile.iconCls)} />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          {/* Tytuł + etykieta kategorii */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              "font-medium leading-snug",
              done && "line-through decoration-muted-foreground/50",
            )}>
              {title}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {TYPE_LABELS[type] ?? type}
            </span>
          </div>

          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {/* Meta: partner · stoisko · cel */}
          {(partnerName || targetValue != null) && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {partnerName && (
                <span>{partnerName}{boothLocation ? ` · ${boothLocation}` : ""}</span>
              )}
              {targetValue != null && (
                <span>Cel: {targetValue} kontaktów</span>
              )}
            </div>
          )}
        </div>

        {/* Pill punktów */}
        {pointsValue != null && (
          done ? (
            <span className="shrink-0 rounded-full bg-aqua/10 px-2.5 py-0.5 text-xs font-semibold text-aqua">
              ✓ Zdobyte {pointsValue} pkt
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-coral px-2.5 py-0.5 text-xs font-semibold text-[#171A2B]">
              +{pointsValue} pkt
            </span>
          )
        )}
      </CardContent>
    </Card>
  );
}
