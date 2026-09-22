"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Mic,
  CalendarDays,
  Users,
  Handshake,
  Target,
  Gift,
  Ticket,
  FileText,
  Megaphone,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/logo";

type NavItem = { href: string; icon: LucideIcon; label: string };

export function EventSidebar({
  eventId,
  gamificationEnabled,
  hasLottery,
  userEmail,
  signOut,
}: {
  eventId: string;
  gamificationEnabled: boolean;
  hasLottery: boolean;
  userEmail: string | null;
  signOut: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const base = `/admin/events/${eventId}`;

  const items: NavItem[] = [
    { href: base,                icon: Settings,    label: "Ustawienia" },
    { href: `${base}/speakers`,  icon: Mic,         label: "Prelegenci" },
    { href: `${base}/sessions`,  icon: CalendarDays, label: "Agenda"   },
    { href: `${base}/attendees`, icon: Users,       label: "Uczestnicy" },
    { href: `${base}/partners`,  icon: Handshake,   label: "Partnerzy"  },
    { href: `${base}/quests`,    icon: Target,      label: "Questy"     },
    ...(gamificationEnabled
      ? [{ href: `${base}/rewards`, icon: Gift, label: "Nagrody" } as NavItem]
      : []),
    ...(hasLottery
      ? [{ href: `${base}/lottery`, icon: Ticket, label: "Loteria" } as NavItem]
      : []),
    { href: `${base}/content`,   icon: FileText,    label: "Treść"      },
    { href: `${base}/messages`,  icon: Megaphone,   label: "Komunikaty" },
  ];

  function isActive(href: string): boolean {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden bg-ev-sidebar">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-ev-sidebar-border px-5">
        <Logo variant="onDark" />
      </div>

      {/* Nav items — scrollable */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-ev-sidebar-active text-ev-sidebar-active-fg"
                      : "text-ev-sidebar-fg hover:bg-ev-sidebar-hover"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer — pinned to bottom */}
      <div className="shrink-0 border-t border-ev-sidebar-border px-3 py-3">
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ev-sidebar-muted transition-colors hover:bg-ev-sidebar-hover hover:text-ev-sidebar-fg"
        >
          <ChevronLeft className="size-4 shrink-0" />
          Wszystkie wydarzenia
        </Link>
        {userEmail && (
          <p className="mt-2 truncate px-3 text-xs text-ev-sidebar-muted">
            {userEmail}
          </p>
        )}
        <form action={signOut} className="mt-1">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ev-sidebar-muted transition-colors hover:bg-ev-sidebar-hover hover:text-ev-sidebar-fg"
          >
            Wyloguj
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — fixed */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile: hamburger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-3.5 z-40 flex size-9 items-center justify-center rounded-lg border bg-background shadow-sm md:hidden"
        aria-label="Otwórz menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Mobile: overlay + drawer */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 md:hidden">
            {sidebarContent}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-lg text-ev-sidebar-muted hover:bg-ev-sidebar-hover hover:text-ev-sidebar-fg"
              aria-label="Zamknij menu"
            >
              <X className="size-4" />
            </button>
          </aside>
        </>
      )}
    </>
  );
}
