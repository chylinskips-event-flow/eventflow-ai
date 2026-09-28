"use client";

import { useState, useTransition, useMemo } from "react";
import { Check, Undo2, QrCode, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QrScanner } from "@/components/qr-scanner";
import type { ReceptionAttendee, CheckInResult } from "@/lib/reception";

type Filter = "all" | "present" | "absent";

interface ReceptionPanelProps {
  attendees: ReceptionAttendee[];
  checkInByQrAction: (checkInToken: string) => Promise<CheckInResult>;
  checkInByIdAction: (attendeeId: string) => Promise<CheckInResult>;
  undoCheckInAction: (attendeeId: string) => Promise<void>;
}

export function ReceptionPanel({
  attendees,
  checkInByQrAction,
  checkInByIdAction,
  undoCheckInAction,
}: ReceptionPanelProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const checkedIn = attendees.filter((a) => a.checked_in_at !== null).length;
  const total = attendees.length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return attendees.filter((a) => {
      if (filter === "present" && !a.checked_in_at) return false;
      if (filter === "absent" && a.checked_in_at) return false;
      if (!q) return true;
      const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.toLowerCase();
      const company = (a.company ?? "").toLowerCase();
      return name.includes(q) || company.includes(q);
    });
  }, [attendees, filter, search]);

  function handleCheckIn(attendeeId: string) {
    setBusyId(attendeeId);
    startTransition(async () => {
      await checkInByIdAction(attendeeId);
      setBusyId(null);
    });
  }

  function handleUndo(attendeeId: string) {
    setBusyId(attendeeId);
    startTransition(async () => {
      await undoCheckInAction(attendeeId);
      setBusyId(null);
    });
  }

  const filterBtns: { value: Filter; label: string }[] = [
    { value: "all", label: "Wszyscy" },
    { value: "present", label: "Obecni" },
    { value: "absent", label: "Jeszcze nie" },
  ];

  return (
    <>
      {/* Counter */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Przyszło</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {checkedIn}
          <span className="text-xl font-normal text-muted-foreground"> / {total}</span>
        </p>
        {total > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.round((checkedIn / total) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Scan QR button */}
      <Button
        onClick={() => setScannerOpen(true)}
        className="w-full"
        size="lg"
      >
        <QrCode className="mr-2 size-5" />
        Skanuj QR
      </Button>

      {/* Search + filter */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj po nazwisku…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {filterBtns.map((btn) => (
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

      {/* List */}
      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Users className="size-8 opacity-40" />
            <p className="text-sm">Brak wyników</p>
          </div>
        )}
        {filtered.map((a) => {
          const name =
            [a.first_name, a.last_name].filter(Boolean).join(" ") || "Uczestnik";
          const isBusy = busyId === a.id && pending;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                {a.company && (
                  <p className="truncate text-xs text-muted-foreground">{a.company}</p>
                )}
                {a.checked_in_at && (
                  <p className="text-xs text-green-600">
                    <Check className="mr-0.5 inline size-3" />
                    {new Date(a.checked_in_at).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              {a.checked_in_at ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUndo(a.id)}
                  disabled={isBusy}
                  className="shrink-0 text-muted-foreground"
                  aria-label="Cofnij zameldowanie"
                >
                  <Undo2 className="mr-1.5 size-4" />
                  Cofnij
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleCheckIn(a.id)}
                  disabled={isBusy}
                  className="shrink-0 bg-green-600 text-white hover:bg-green-700"
                >
                  <Check className="mr-1.5 size-4" />
                  Zamelduj
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* QR Scanner overlay */}
      {scannerOpen && (
        <QrScanner
          onScan={checkInByQrAction}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </>
  );
}
