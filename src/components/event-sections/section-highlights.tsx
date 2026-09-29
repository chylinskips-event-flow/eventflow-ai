import {
  Star, Zap, Target, Globe, Clock, Users, Award, Check, Lightbulb,
  Shield, Heart, Trophy, Rocket, ThumbsUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HighlightsContent, HighlightIcon } from "@/lib/event-sections";

const ICON_MAP: Record<HighlightIcon, LucideIcon> = {
  star: Star, zap: Zap, target: Target, globe: Globe, clock: Clock,
  users: Users, award: Award, check: Check, lightbulb: Lightbulb,
  shield: Shield, heart: Heart, trophy: Trophy, rocket: Rocket, "thumbs-up": ThumbsUp,
};

export function SectionHighlights({ content }: { content: HighlightsContent }) {
  if (!content.items?.length) return null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      {content.heading && (
        <h2 className="mb-6 text-xl font-semibold">{content.heading}</h2>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((item, i) => {
          const Icon = item.icon ? ICON_MAP[item.icon] : null;
          return (
            <div key={i} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              {Icon && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-4 text-primary" />
                </div>
              )}
              <div>
                <p className="font-medium leading-tight">{item.title}</p>
                {item.text && (
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
