import { MapPin, Navigation } from "lucide-react";
import type { DojazdContent } from "@/lib/event-sections";

export function SectionDojazd({ content }: { content: DojazdContent }) {
  if (!content.address) return null;

  const gmapsSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(content.address)}`;
  const directionsUrl = content.directions_url || gmapsSearch;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      {content.heading && (
        <h2 className="mb-4 text-xl font-semibold">{content.heading}</h2>
      )}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-base">{content.address}</p>
        </div>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Navigation className="size-4" />
          Wyznacz trasę
        </a>
      </div>
    </section>
  );
}
