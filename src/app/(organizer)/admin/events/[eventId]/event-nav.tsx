"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EventNav({
  eventId,
  slug,
}: {
  eventId: string;
  slug: string | null;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: `/admin/events/${eventId}`, label: "Ustawienia" },
    { href: `/admin/events/${eventId}/speakers`, label: "Prelegenci" },
    { href: `/admin/events/${eventId}/sessions`, label: "Agenda" },
    { href: `/admin/events/${eventId}/attendees`, label: "Uczestnicy" },
    { href: `/admin/events/${eventId}/content`, label: "Treść" },
    { href: `/admin/events/${eventId}/messages`, label: "Komunikaty" },
  ];

  return (
    <nav className="flex items-center justify-between gap-2 border-b px-6 pt-4">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-b-2 border-primary text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {slug && (
        <Button asChild variant="outline" size="sm" className="mb-2">
          <a
            href={`/e/${slug}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4" />
            Podgląd
          </a>
        </Button>
      )}
    </nav>
  );
}
