"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Znacznik przy zakładce (np. ✓ / ● / ⏳) — `label` czytany przez czytniki ekranu. */
export type TabMark = { symbol: string; label: string; className?: string };

export type TabBarItem<K extends string = string> = {
  key: K;
  label: string;
  mark?: TabMark | null;
  /** Podpowiedź po najechaniu (np. termin składania). */
  title?: string;
};

/** Identyfikatory tab / tabpanel dla aria-controls i aria-labelledby (prefiks per ekran). */
export const tabDomId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
export const panelDomId = (prefix: string, key: string) => `${prefix}-tabpanel-${key}`;

/**
 * Wspólny pasek zakładek (panel partnera, panel organizatora): role="tablist", strzałki /
 * Home / End przełączają, aktywna zakładka przewijana do widoku tylko w obrębie paska.
 * Na telefonie przewijany poziomo, bez łamania i bez widocznego suwaka; gradient po prawej,
 * gdy dalej są kolejne zakładki.
 */
export function TabBar<K extends string>({
  tabs,
  active,
  onSelect,
  idPrefix,
  ariaLabel,
}: {
  tabs: TabBarItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  idPrefix: string;
  ariaLabel: string;
}) {
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const [fadeRight, setFadeRight] = useState(false);

  function updateFade() {
    const el = scroller.current;
    if (el) setFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  useEffect(() => {
    // Przewijamy tylko pasek zakładek (poziomo), nie całą stronę.
    const el = scroller.current;
    const tab = refs.current.get(active);
    if (el && tab) {
      const left = tab.offsetLeft - el.offsetLeft;
      if (left < el.scrollLeft) el.scrollTo({ left: left - 16 });
      else if (left + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left: left + tab.offsetWidth - el.clientWidth + 16 });
    }
    updateFade();
  }, [active]);

  useEffect(() => {
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, []);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const next =
      e.key === "ArrowRight" ? (index + 1) % tabs.length
      : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    const key = tabs[next].key;
    onSelect(key);
    refs.current.get(key)?.focus();
  }

  return (
    // Linia bazowa rysowana osobno (absolute), żeby podkreślenie zakładki nie wystawało poza
    // przewijany kontener (ujemny margines dawał pionowe przewijanie i widoczny suwak).
    <div className="relative -mx-4 min-w-0 sm:mx-0">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
      <div
        ref={scroller}
        role="tablist"
        aria-label={ariaLabel}
        onScroll={updateFade}
        className="relative flex gap-1 overflow-x-auto overflow-y-hidden px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t, i) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              ref={(el) => {
                if (el) refs.current.set(t.key, el);
                else refs.current.delete(t.key);
              }}
              id={tabDomId(idPrefix, t.key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelDomId(idPrefix, t.key)}
              tabIndex={selected ? 0 : -1}
              title={t.title}
              onClick={() => onSelect(t.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                // ring-inset: obrys fokusu mieści się w kontenerze z overflow-y: hidden.
                "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.mark && (
                <>
                  <span aria-hidden className={cn("text-xs", t.mark.className)}>
                    {t.mark.symbol}
                  </span>
                  <span className="sr-only">({t.mark.label})</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {fadeRight && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
      )}
    </div>
  );
}
