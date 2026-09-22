"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Handshake, Trophy, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

  const items: NavItem[] = [
    { href: base,                icon: Home,        label: "Start"    },
    { href: `${base}/agenda`,    icon: CalendarDays, label: "Agenda"  },
    { href: `${base}/contacts`,  icon: Handshake,   label: "Kontakty" },
  ];
  if (gamificationEnabled) {
    items.push({ href: `${base}/ranking`, icon: Trophy, label: "Ranking" });
  }
  items.push({ href: `${base}/profile`, icon: User, label: "Profil" });

  function isActive(href: string): boolean {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card md:hidden">
      <div className="flex items-stretch">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
