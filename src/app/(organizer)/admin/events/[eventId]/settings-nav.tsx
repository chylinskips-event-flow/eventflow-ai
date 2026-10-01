"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { id: "ogolne", label: "Ogólne" },
  { id: "branding", label: "Branding" },
  { id: "identyfikatory", label: "Identyfikatory" },
  { id: "strefa-niebezpieczna", label: "Strefa niebezpieczna" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

// Odstęp między dolną krawędzią przyklejonych elementów a nagłówkiem sekcji po przewinięciu.
const SCROLL_GAP_PX = 16;

/**
 * Wysokość elementów przyklejonych u góry viewportu: nagłówek workspace
 * (layout eventu) + poziomy pasek sekcji, jeśli jest widoczny (< xl).
 */
function stickyTopHeight(): number {
  const header = document.querySelector<HTMLElement>("[data-workspace-header]");
  const bar = document.querySelector<HTMLElement>("[data-settings-bar]");
  return (header?.offsetHeight ?? 0) + (bar?.offsetHeight ?? 0);
}

function useActiveSection() {
  const [activeId, setActiveId] = useState<SettingsSectionId>(
    SETTINGS_SECTIONS[0].id,
  );
  // Sekcja kliknięta w nawigacji — trzyma podświetlenie, dopóki użytkownik sam nie przewinie
  // (krótka sekcja przy dole strony nie dojedzie do górnej krawędzi).
  const clickedIdRef = useRef<SettingsSectionId | null>(null);

  useEffect(() => {
    function updateActive() {
      if (clickedIdRef.current) {
        setActiveId(clickedIdRef.current);
        return;
      }
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActiveId(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id);
        return;
      }
      const threshold = stickyTopHeight() + SCROLL_GAP_PX * 2;
      let current: SettingsSectionId = SETTINGS_SECTIONS[0].id;
      for (const section of SETTINGS_SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= threshold) {
          current = section.id;
        }
      }
      setActiveId(current);
    }

    function releaseClicked() {
      clickedIdRef.current = null;
    }

    const userScrollEvents = ["wheel", "touchstart", "keydown"] as const;

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    for (const type of userScrollEvents) {
      window.addEventListener(type, releaseClicked, { passive: true });
    }
    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
      for (const type of userScrollEvents) {
        window.removeEventListener(type, releaseClicked);
      }
    };
  }, []);

  function scrollToSection(
    e: React.MouseEvent<HTMLAnchorElement>,
    id: SettingsSectionId,
  ) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    clickedIdRef.current = id;
    const top =
      el.getBoundingClientRect().top +
      window.scrollY -
      stickyTopHeight() -
      SCROLL_GAP_PX;
    window.scrollTo({ top, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  }

  return { activeId, scrollToSection };
}

/** Pionowa lista sekcji obok treści — przyklejona pod nagłówkiem (xl+). */
export function SettingsNav({ className }: { className?: string }) {
  const { activeId, scrollToSection } = useActiveSection();
  const headerHeight = useWorkspaceHeaderHeight();

  return (
    <nav aria-label="Sekcje ustawień" className={className}>
      <ul
        className="sticky flex flex-col gap-0.5 border-l"
        style={{ top: headerHeight + 24 }}
      >
        {SETTINGS_SECTIONS.map((section) => {
          const active = section.id === activeId;
          const danger = section.id === "strefa-niebezpieczna";
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(e) => scrollToSection(e, section.id)}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors",
                  active
                    ? danger
                      ? "border-destructive font-medium text-destructive"
                      : "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Poziomy pasek sekcji przyklejony pod nagłówkiem — na węższych ekranach (< xl). */
export function SettingsBar({ className }: { className?: string }) {
  const { activeId, scrollToSection } = useActiveSection();
  const headerHeight = useWorkspaceHeaderHeight();

  return (
    <nav
      aria-label="Sekcje ustawień"
      data-settings-bar
      className={cn(
        "sticky z-10 -mx-6 border-b bg-background px-6 py-2",
        className,
      )}
      style={{ top: headerHeight }}
    >
      <ul className="flex gap-1 overflow-x-auto">
        {SETTINGS_SECTIONS.map((section) => {
          const active = section.id === activeId;
          const danger = section.id === "strefa-niebezpieczna";
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                onClick={(e) => scrollToSection(e, section.id)}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "block rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? danger
                      ? "bg-destructive/10 font-medium text-destructive"
                      : "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Aktualna wysokość nagłówka workspace (zawija się na wąskich ekranach). */
function useWorkspaceHeaderHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-workspace-header]");
    if (!header) return;
    const update = () => setHeight(header.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return height;
}
