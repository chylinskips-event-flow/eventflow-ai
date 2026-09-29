import { BedDouble, ExternalLink } from "lucide-react";
import type { NoclegContent } from "@/lib/event-sections";

export function SectionNocleg({ content }: { content: NoclegContent }) {
  if (!content.items?.length) return null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      {content.heading && (
        <h2 className="mb-4 text-xl font-semibold">{content.heading}</h2>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {content.items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <BedDouble className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-tight">{item.name}</p>
              {item.distance && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.distance}</p>
              )}
              {item.note && (
                <p className="text-sm text-muted-foreground mt-1">{item.note}</p>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Strona WWW <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
