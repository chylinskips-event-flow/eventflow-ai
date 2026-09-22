"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  Users,
  Target,
  MoreHorizontal,
  X,
  Handshake,
  Trophy,
  Gift,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; icon: LucideIcon; label: string };

export function BottomNav({
  slug,
  gamificationEnabled,
}: {
  slug: string;
  gamificationEnabled: boolean;
}) {
  const pathname = usePathname();
  const base = `/e/${slug}`;
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const mainItems: NavItem[] = [
    { href: base,                   icon: Home,         label: "Start"       },
    { href: `${base}/agenda`,       icon: CalendarDays, label: "Agenda"      },
    { href: `${base}/attendees`,    icon: Users,        label: "Uczestnicy"  },
  ];
  if (gamificationEnabled) {
    mainItems.push({ href: `${base}/quests`, icon: Target, label: "Questy" });
  }

  const sheetItems: NavItem[] = [
    { href: `${base}/contacts`, icon: Handshake, label: "Kontakty" },
    ...(gamificationEnabled
      ? [
          { href: `${base}/ranking`, icon: Trophy, label: "Ranking" },
          { href: `${base}/rewards`, icon: Gift,   label: "Nagrody" },
        ]
      : []),
    { href: `${base}/profile`, icon: User, label: "Profil" },
  ];

  function isMainActive(href: string) {
    return href === base ? pathname === base : pathname.startsWith(href);
  }

  const isMoreActive = !moreOpen && sheetItems.some((i) => pathname.startsWith(i.href));

  return (
    <>
      {/* Overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          aria-hidden
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* Sheet „Więcej" */}
      <div
        className={cn(
          "fixed bottom-16 left-0 right-0 z-50 rounded-t-2xl border-t bg-card shadow-xl transition-transform duration-200",
          moreOpen ? "translate-y-0" : "translate-y-full pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Więcej</span>
          <button
            onClick={() => setMoreOpen(false)}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Zamknij"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 p-2">
          {sheetItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn("size-6", active ? "text-primary" : "text-muted-foreground")}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card md:hidden">
        <div className="flex items-stretch">
          {mainItems.map((item) => {
            const active = isMainActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-5", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              isMoreActive || moreOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MoreHorizontal
              className={cn("size-5", (isMoreActive || moreOpen) && "text-primary")}
            />
            Więcej
          </button>
        </div>
      </nav>
    </>
  );
}
