"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Polskie etykiety przez Intl — niezależne od locale przeglądarki (to jest cel
// tego komponentu). Wartość wewnętrzna pozostaje naiwna ("YYYY-MM-DDTHH:mm"),
// bez strefy — logika stref zostaje w Server Actions.
const MONTH_YEAR_FMT = new Intl.DateTimeFormat("pl-PL", {
  month: "long",
  year: "numeric",
});
const TRIGGER_FMT = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const WEEKDAYS = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"];
const DEFAULT_TIME = "09:00";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Siatka miesiąca (poniedziałek pierwszy); null = puste komórki.
function buildGrid(year: number, month: number): (number | null)[] {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateTimePicker({
  value,
  onChange,
  name,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [datePart, timePart] = value ? value.split("T") : ["", ""];

  const initialView = datePart || todayDateStr();
  const [iy, im] = initialView.split("-").map(Number);
  const [view, setView] = React.useState({ year: iy, month: (im ?? 1) - 1 });

  const selected = datePart
    ? {
        year: Number(datePart.split("-")[0]),
        month: Number(datePart.split("-")[1]) - 1,
        day: Number(datePart.split("-")[2]),
      }
    : null;

  // Każda interakcja emituje pełną wartość (z domyślnym dniem/godziną), żeby
  // hidden input nigdy nie miał połowicznego "YYYY-MM-DDT" / "THH:mm".
  function emit(nextDate: string, nextTime: string) {
    onChange(`${nextDate || todayDateStr()}T${nextTime || DEFAULT_TIME}`);
  }

  function pickDay(day: number) {
    emit(`${view.year}-${pad(view.month + 1)}-${pad(day)}`, timePart);
  }

  function changeMonth(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      return {
        year: v.year + Math.floor(m / 12),
        month: ((m % 12) + 12) % 12,
      };
    });
  }

  const triggerLabel = datePart
    ? `${TRIGGER_FMT.format(
        new Date(selected!.year, selected!.month, selected!.day),
      )}, ${timePart || DEFAULT_TIME}`
    : "Wybierz datę i godzinę";

  const grid = buildGrid(view.year, view.month);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            className={cn(
              "w-full justify-start font-normal",
              !datePart && "text-muted-foreground",
              className,
            )}
          >
            <CalendarIcon className="size-4" />
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                className="size-8 p-0"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium capitalize">
                {MONTH_YEAR_FMT.format(new Date(view.year, view.month, 1))}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="size-8 p-0"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((day, i) => {
                if (day === null) return <span key={i} />;
                const isSelected =
                  selected &&
                  selected.year === view.year &&
                  selected.month === view.month &&
                  selected.day === day;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickDay(day)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent",
                      isSelected &&
                        "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 border-t pt-3">
              <span className="text-sm text-muted-foreground">Godzina</span>
              <input
                type="time"
                step={300}
                value={timePart}
                onChange={(e) => emit(datePart, e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
