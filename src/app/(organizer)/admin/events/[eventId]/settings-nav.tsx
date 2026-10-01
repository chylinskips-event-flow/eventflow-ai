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

// Odległość od góry viewportu (pod sticky headerem), od której sekcja liczy się jako aktywna.
const ACTIVE_OFFSET_PX = 120;

export function SettingsNav({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState<SettingsSectionId>(
    SETTINGS_SECTIONS[0].id,
  );
  // Sekcja kliknięta w sub-nav — trzyma podświetlenie, dopóki użytkownik sam nie przewinie
  // (krótka sekcja przy dole strony nie dojedzie do ACTIVE_OFFSET_PX).
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
      let current: SettingsSectionId = SETTINGS_SECTIONS[0].id;
      for (const section of SETTINGS_SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) {
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

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    clickedIdRef.current = id;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  }

  return (
    <nav aria-label="Sekcje ustawień" className={className}>
      <ul className="sticky top-24 flex flex-col gap-0.5 border-l">
        {SETTINGS_SECTIONS.map((section) => {
          const active = section.id === activeId;
          const danger = section.id === "strefa-niebezpieczna";
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(e) => handleClick(e, section.id)}
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
