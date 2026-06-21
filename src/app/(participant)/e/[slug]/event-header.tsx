import type { Event } from "@/lib/events";

export function EventHeader({ event }: { event: Event }) {
  return (
    <header className="flex items-center gap-3 border-b p-4">
      {event.logo_url ? (
        <img
          src={event.logo_url}
          alt={event.name}
          className="h-10 w-auto max-w-[200px] object-contain"
        />
      ) : (
        <span className="text-lg font-semibold text-primary">
          {event.name}
        </span>
      )}
    </header>
  );
}
