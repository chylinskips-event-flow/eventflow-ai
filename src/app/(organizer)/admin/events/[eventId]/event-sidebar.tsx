"use client";

import { useEffect, useRef, useState } from "react";
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
  Network,
  MessageCircleQuestion,
  Presentation,
  ScanLine,
  ShoppingBag,
  CreditCard,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/logo";

type NavItem = { href: string; icon: LucideIcon; label: string };
export type NavSection = { id: string; label: string; items: NavItem[] };

/** Menu wydarzenia w sekcjach. Etykiety pozycji i adresy bez zmian — zmienia się tylko układ. */
export function buildNavSections(
  base: string,
  { gamificationEnabled, hasLottery }: { gamificationEnabled: boolean; hasLottery: boolean },
): NavSection[] {
  return [
    {
      id: "prep",
      label: "Przygotowanie",
      items: [
        { href: base,               icon: Settings,     label: "Ustawienia" },
        { href: `${base}/content`,  icon: FileText,     label: "Treść"      },
        { href: `${base}/speakers`, icon: Mic,          label: "Prelegenci" },
        { href: `${base}/sessions`, icon: CalendarDays, label: "Agenda"     },
        { href: `${base}/tickets`,  icon: ShoppingBag,  label: "Bilety"     },
      ],
    },
    {
      id: "people",
      label: "Ludzie i partnerzy",
      items: [
        { href: `${base}/attendees`, icon: Users,     label: "Uczestnicy" },
        { href: `${base}/partners`,  icon: Handshake, label: "Partnerzy"  },
      ],
    },
    {
      id: "event-day",
      label: "Dzień eventu",
      items: [
        { href: `${base}/reception`,  icon: ScanLine,              label: "Recepcja"      },
        { href: `${base}/moderator`,  icon: Presentation,          label: "Prowadzący"    },
        { href: `${base}/engagement`, icon: MessageCircleQuestion, label: "Q&A i ankiety" },
        { href: `${base}/messages`,   icon: Megaphone,             label: "Komunikaty"    },
      ],
    },
    {
      id: "engagement",
      label: "Zaangażowanie",
      items: [
        { href: `${base}/quests`, icon: Target, label: "Questy" },
        ...(gamificationEnabled
          ? [{ href: `${base}/rewards`, icon: Gift, label: "Nagrody" }]
          : []),
        ...(hasLottery
          ? [{ href: `${base}/lottery`, icon: Ticket, label: "Loteria" }]
          : []),
        { href: `${base}/mixer`, icon: Network, label: "Business Mixer" },
      ],
    },
    {
      id: "billing",
      label: "Rozliczenia",
      items: [{ href: `${base}/payments`, icon: CreditCard, label: "Płatności" }],
    },
  ];
}

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
  const sections = buildNavSections(base, { gamificationEnabled, hasLottery });

  function isActive(href: string): boolean {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  // Sekcja z aktywną pozycją zawsze widoczna — przewijamy menu do aktywnej pozycji
  // (po wejściu na stronę i po otwarciu menu na telefonie).
  const activeRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  useEffect(() => {
    const key = isOpen ? "mobile" : "desktop";
    activeRefs.current[key]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, pathname]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const sidebarContent = (variant: "desktop" | "mobile") => (
    <div className="flex h-full flex-col overflow-hidden bg-ev-sidebar">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-ev-sidebar-border px-5">
        <Logo variant="onDark" />
      </div>

      {/* Nav — sekcje z etykietami jako nagłówki, przewijane */}
      <nav aria-label="Menu wydarzenia" className="flex-1 overflow-y-auto px-3 py-3">
        {sections.map((section) => {
          const headingId = `nav-${variant}-${section.id}`;
          return (
            <div key={section.id} className="mb-3 last:mb-0">
              <h2
                id={headingId}
                className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ev-sidebar-muted"
              >
                {section.label}
              </h2>
              <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        ref={active ? (el) => { activeRefs.current[variant] = el; } : undefined}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ev-sidebar-active-fg md:py-2 ${
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
            </div>
          );
        })}
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
        {sidebarContent("desktop")}
      </aside>

      {/* Mobile: hamburger button (wyśrodkowany w nagłówku h-14) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-2.5 z-40 flex size-9 items-center justify-center rounded-lg border bg-background shadow-sm md:hidden"
        aria-label="Otwórz menu"
        aria-expanded={isOpen}
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
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu wydarzenia"
            className="fixed inset-y-0 left-0 z-50 w-64 md:hidden"
          >
            {sidebarContent("mobile")}
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
