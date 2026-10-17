"use client";

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
import { TabBar as SharedTabBar, panelDomId, tabDomId } from "@/components/tab-bar";

export const tabId = (key: TabKey) => tabDomId("partner", key);
export const panelId = (key: TabKey) => panelDomId("partner", key);

const MARK_CLASS = {
  done: "text-green-600 dark:text-green-400",
  todo: "text-amber-600 dark:text-amber-400",
  waiting: "",
} as const;

/** Pasek zakładek panelu partnera — wspólny TabBar ze znacznikami ✓ / ● / ⏳. */
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
  return (
    <SharedTabBar
      idPrefix="partner"
      ariaLabel="Sekcje panelu partnera"
      active={active}
      onSelect={onSelect}
      tabs={tabs.map((t) => ({
        key: t.key,
        label: t.label,
        title: t.key === "stoisko" && boothDeadline ? "Termin składania: " + boothDeadline : undefined,
        mark: t.status
          ? { symbol: TAB_STATUS_MARK[t.status].mark, label: TAB_STATUS_MARK[t.status].label, className: MARK_CLASS[t.status] }
          : null,
      }))}
    />
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
