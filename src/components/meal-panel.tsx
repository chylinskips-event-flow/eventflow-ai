"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, QrCode, Search, Undo2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/components/qr-scanner";
import type { MealAttendee } from "@/lib/meals-shared";
import type { CheckInResult } from "@/lib/reception";

type Filter = "all" | "redeemed" | "waiting";

interface MealPanelProps {
  mealName: string;
  attendees: MealAttendee[];
  redeemByQrAction: (checkInToken: string) => Promise<CheckInResult>;
  redeemByIdAction: (attendeeId: string) => Promise<CheckInResult>;
  undoAction: (attendeeId: string) => Promise<void>;
  /** Klasa CSS `top-*` dla przyklejonego nagłówka */
  stickyTopClass: string;
}

const FILTER_BTNS: { value: Filter; label: string }[] = [
  { value: "all", label: "Wszyscy" },
  { value: "redeemed", label: "Wydane" },
  { value: "waiting", label: "Jeszcze nie" },
];

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

export function MealPanel({
  mealName,
  attendees,
  redeemByQrAction,
  redeemByIdAction,
  undoAction,
  stickyTopClass,
}: MealPanelProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redeemed = attendees.filter((a) => a.redeemed_at !== null).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return attendees.filter((a) => {
      if (filter === "redeemed" && !a.redeemed_at) return false;
      if (filter === "waiting" && a.redeemed_at) return false;
      if (!q) return true;
      const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (a.company ?? "").toLowerCase().includes(q);
    });
  }, [attendees, filter, search]);

  function run(attendeeId: string, action: () => Promise<unknown>) {
    setBusyId(attendeeId);
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("Nie udało się zapisać. Sprawdź internet i spróbuj ponownie.");
      }
      setBusyId(null);
    });
  }

  return (
    <div>
      <div
        className={`sticky ${stickyTopClass} z-10 bg-background`}
        style={{ boxShadow: "0 1px 0 hsl(var(--border))" }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums leading-none">{redeemed}</span>
            <span className="text-sm text-muted-foreground">/ {attendees.length} wydano</span>
          </div>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setScannerOpen(true)}>
            <QrCode className="mr-1.5 size-4" />
            Skanuj QR
          </Button>
        </div>

        <div className="relative mx-4 mb-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj po nazwisku…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-1 px-4 pb-3">
          {FILTER_BTNS.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === btn.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 px-4 py-3">
        {error && <p className="pb-2 text-sm text-destructive">{error}</p>}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Users className="size-8 opacity-40" />
            <p className="text-sm">Brak wyników</p>
          </div>
        )}
        {filtered.map((a) => {
          const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "Uczestnik";
          const isBusy = busyId === a.id && pending;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                {a.company && <p className="truncate text-xs text-muted-foreground">{a.company}</p>}
                {a.redeemed_at && (
                  <p className="text-xs text-green-600">
                    <Check className="mr-0.5 inline size-3" />
                    {timeLabel(a.redeemed_at)}
                  </p>
                )}
              </div>
              {a.redeemed_at ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => run(a.id, () => undoAction(a.id))}
                  disabled={isBusy}
                  className="shrink-0 text-muted-foreground"
                  aria-label={`Cofnij wydanie: ${name}`}
                >
                  <Undo2 className="mr-1.5 size-4" />
                  Cofnij
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => run(a.id, () => redeemByIdAction(a.id))}
                  disabled={isBusy}
                  className="shrink-0 bg-green-600 text-white hover:bg-green-700"
                >
                  <Check className="mr-1.5 size-4" />
                  Wydaj
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {scannerOpen && (
        <QrScanner
          onScan={redeemByQrAction}
          onClose={() => setScannerOpen(false)}
          title={mealName}
          successLabel="Wydano"
          alreadyLabel="Już odebrano"
          notApprovedLabel="Bilet nieważny"
        />
      )}
    </div>
  );
}
