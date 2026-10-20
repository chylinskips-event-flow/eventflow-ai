"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ExternalLink, RotateCcw } from "lucide-react";
import { checklistHiddenKey, checklistStartsExpanded, type Checklist } from "@/lib/event-checklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Zdarzenie okna: przywrócenie checklisty z Ustawień (ta sama strona). */
const RESTORE_EVENT = "eventro:checklist-restore";

function readHidden(eventId: string): boolean {
  try {
    return window.localStorage.getItem(checklistHiddenKey(eventId)) === "1";
  } catch {
    return false; // localStorage niedostępny → checklista po prostu się pokazuje
  }
}

function writeHidden(eventId: string, hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(checklistHiddenKey(eventId), "1");
    else window.localStorage.removeItem(checklistHiddenKey(eventId));
  } catch {
    // brak dostępu do localStorage — ukrycie działa tylko do odświeżenia strony
  }
}

/**
 * Checklista startowa wydarzenia (tylko panel organizatora). Zwinięta: pasek „Przygotuj
 * wydarzenie · X z Y kroków” z postępem; rozwinięta: kroki z opisem, ✓ i „Przejdź”.
 * Ukrycie zapamiętywane w localStorage (bez zmian w bazie), przywracane w Ustawieniach.
 */
export function EventChecklist({ eventId, checklist }: { eventId: string; checklist: Checklist }) {
  // null = jeszcze nie wiemy (localStorage dostępny dopiero w przeglądarce) — bez mignięcia.
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(() => checklistStartsExpanded(checklist));
  const [confirmHide, setConfirmHide] = useState(false);

  useEffect(() => {
    const sync = () => setHidden(readHidden(eventId));
    const frame = window.requestAnimationFrame(sync);
    const onRestore = () => {
      setHidden(false);
      setExpanded(true);
    };
    window.addEventListener(RESTORE_EVENT, onRestore);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(RESTORE_EVENT, onRestore);
    };
  }, [eventId]);

  if (hidden !== false) return null;

  const { steps, done, total, complete } = checklist;
  const bodyId = `checklist-${eventId}`;

  function hide() {
    writeHidden(eventId, true);
    setHidden(true);
    setConfirmHide(false);
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex min-w-0 items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {complete ? "Wszystko gotowe 🎉" : "Przygotuj wydarzenie"}
            <span className="font-normal text-muted-foreground">
              {" "}· {done} z {total} {total === 1 ? "kroku" : "kroków"}
            </span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={expanded ? "Zwiń checklistę" : "Rozwiń checklistę"}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn("size-5 transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>

      {expanded && (
        <div id={bodyId} className="border-t">
          <ul className="divide-y">
            {steps.map((s) => (
              <li key={s.key} className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    s.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {s.done && <Check className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.title}
                    {s.optional && <span className="font-normal text-muted-foreground"> (opcjonalnie)</span>}
                    <span className="sr-only">{s.done ? " — zrobione" : " — do zrobienia"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {s.extraLink && (
                    <Button asChild variant="ghost" size="sm" className="min-h-11">
                      <a href={s.extraLink.href} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> {s.extraLink.label}
                      </a>
                    </Button>
                  )}
                  <Button asChild variant={s.done ? "ghost" : "outline"} size="sm" className="min-h-11">
                    <Link href={s.href}>Przejdź</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 text-sm">
            {confirmHide ? (
              <>
                <span className="text-muted-foreground">Możesz ją przywrócić w Ustawieniach.</span>
                <Button type="button" size="sm" className="min-h-11" onClick={hide}>
                  Ukryj
                </Button>
                <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setConfirmHide(false)}>
                  Anuluj
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setConfirmHide(true)}>
                Ukryj checklistę
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Ustawienia → Ogólne: przywrócenie ukrytej checklisty (widoczne tylko, gdy jest ukryta). */
export function ChecklistRestoreButton({ eventId }: { eventId: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHidden(readHidden(eventId)));
    return () => window.cancelAnimationFrame(frame);
  }, [eventId]);

  if (!hidden) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 w-fit"
      onClick={() => {
        writeHidden(eventId, false);
        setHidden(false);
        window.dispatchEvent(new Event(RESTORE_EVENT));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      <RotateCcw /> Pokaż checklistę startową
    </Button>
  );
}
