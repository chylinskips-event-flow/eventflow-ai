import type { EventContentSection } from "@/lib/event-content";
import { cn } from "@/lib/utils";

export function ContentSections({
  sections,
}: {
  sections: EventContentSection[];
}) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <div
          key={section.id}
          className={cn(
            "gap-6",
            section.image_url
              ? "grid grid-cols-1 items-center md:grid-cols-2 md:gap-8"
              : "flex flex-col",
          )}
        >
          {section.image_url && (
            <img
              src={section.image_url}
              alt={section.title}
              className="aspect-[4/3] w-full rounded-lg object-cover"
            />
          )}
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {section.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
