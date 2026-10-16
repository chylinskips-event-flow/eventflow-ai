"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    refs.current.get(active)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

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
    <div
      role="tablist"
      aria-label="Sekcje panelu partnera"
      className="-mx-4 flex min-w-0 gap-1 overflow-x-auto border-b px-4 [scrollbar-width:thin] sm:mx-0 sm:px-0"
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
              "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
