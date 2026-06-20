"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/admin/events/${eventId}`, label: "Ustawienia" },
    { href: `/admin/events/${eventId}/speakers`, label: "Prelegenci" },
    { href: `/admin/events/${eventId}/sessions`, label: "Agenda" },
  ];

  return (
    <nav className="flex gap-1 border-b px-6 pt-4">
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
    </nav>
  );
}
