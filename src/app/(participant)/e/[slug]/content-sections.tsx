import type { EventContentSection } from "@/lib/event-content";

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
          className="flex flex-col gap-4 sm:flex-row sm:items-start"
        >
          {section.image_url && (
            <img
              src={section.image_url}
              alt={section.title}
              className="h-40 w-full rounded object-cover sm:h-32 sm:w-48 sm:shrink-0"
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
