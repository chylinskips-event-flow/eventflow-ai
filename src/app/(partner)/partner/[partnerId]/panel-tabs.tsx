"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  TAB_STATUS_MARK,
  type NextTask,
  type TabInfo,
  type TabKey,
} from "@/lib/partner-panel-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const tabId = (key: TabKey) => `partner-tab-${key}`;
export const panelId = (key: TabKey) => `partner-tabpanel-${key}`;

const MARK_CLASS = {
  done: "text-green-600 dark:text-green-400",
  todo: "text-amber-600 dark:text-amber-400",
  waiting: "",
} as const;

/**
 * Pasek zakładek: role="tablist", strzałki / Home / End przełączają, aktywna zawsze
 * przewinięta do widoku. Na telefonie przewijany poziomo, bez łamania na dwa wiersze.
 */
export function TabBar({
  tabs,
  active,
  onSelect,
  boothDeadline,
}: {
  tabs: TabInfo[];
  active: TabKey;
  onSelect: (key: TabKey) => void;
  boothDeadline: string | null;
}) {
  const refs = useRef(new Map<TabKey, HTMLButtonElement>());
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
    // przewijany kontener — wcześniej -mb-px dawało pionowe przewijanie i widoczny suwak.
    <div className="relative -mx-4 min-w-0 sm:mx-0">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
      <div
        ref={scroller}
        role="tablist"
        aria-label="Sekcje panelu partnera"
        onScroll={updateFade}
        className="relative flex gap-1 overflow-x-auto overflow-y-hidden px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
      {tabs.map((t, i) => {
        const selected = t.key === active;
        const mark = t.status ? TAB_STATUS_MARK[t.status] : null;
        return (
          <button
            key={t.key}
            ref={(el) => {
              if (el) refs.current.set(t.key, el);
              else refs.current.delete(t.key);
            }}
            id={tabId(t.key)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(t.key)}
            tabIndex={selected ? 0 : -1}
            title={t.key === "stoisko" && boothDeadline ? `Termin składania: ${boothDeadline}` : undefined}
            onClick={() => onSelect(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              // ring-inset: obrys fokusu mieści się w kontenerze z overflow-y: hidden.
              "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {mark && t.status && (
              <span aria-hidden className={cn("text-xs", MARK_CLASS[t.status])}>
                {mark.mark}
              </span>
            )}
            {mark && <span className="sr-only">({mark.label})</span>}
          </button>
        );
      })}
      </div>
      {/* Sygnał, że po prawej są kolejne zakładki (tylko gdy da się przewinąć dalej). */}
      {fadeRight && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
      )}
    </div>
  );
}

/** „Uzupełnione X z Y” — bez procentów i animacji. */
export function ProgressLine({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">
        Uzupełnione {done} z {total}
      </span>
      <div className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < done ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}

/** Ekran „Co dalej?”: 1–2 najważniejsze zadania, każde prowadzi do swojej zakładki. */
export function NextSteps({
  tasks,
  hasWaiting,
  onOpen,
}: {
  tasks: NextTask[];
  hasWaiting: boolean;
  onOpen: (key: TabKey) => void;
}) {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-medium">Wszystko uzupełnione</p>
            <p className="text-muted-foreground">
              {hasWaiting
                ? "Część zmian czeka jeszcze na akceptację organizatora — damy znać e-mailem."
                : "Możesz wrócić tu w każdej chwili, żeby coś poprawić."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {tasks.map((t) => (
        <Card key={`${t.tab}-${t.title}`}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="font-medium">{t.title}</p>
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>
            <Button size="sm" onClick={() => onOpen(t.tab)}>
              Przejdź <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
