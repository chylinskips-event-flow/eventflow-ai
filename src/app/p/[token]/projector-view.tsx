"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MixerLiveState, ProjectorTable } from "@/lib/mixer/getters";

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ startedAt, roundMinutes }: { startedAt: string; roundMinutes: number }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    function calc() {
      const endMs = new Date(startedAt).getTime() + roundMinutes * 60_000;
      return Math.max(0, endMs - Date.now());
    }
    setRemaining(calc());
    const id = setInterval(() => setRemaining(calc()), 1_000);
    return () => clearInterval(id);
  }, [startedAt, roundMinutes]);

  if (remaining === null) return null;
  if (remaining === 0) {
    return <span className="text-orange-300 text-2xl font-semibold">czas minął</span>;
  }
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1_000);
  return (
    <span className="tabular-nums text-3xl font-bold text-indigo-300">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ── TableCard ─────────────────────────────────────────────────────────────────

function TableCard({ table }: { table: ProjectorTable }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-5">
      {/* Table header */}
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-700 pb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">
          Stół {table.tableNumber}
        </p>
        {table.question && (
          <p className="text-right text-[10px] leading-tight text-slate-500 max-w-[55%]">
            {table.question}
          </p>
        )}
      </div>

      {/* Participants */}
      <ul className="flex flex-col gap-2">
        {table.participants.map((p) => (
          <li key={p.display_name}>
            <p className="text-base font-semibold leading-tight text-white">
              {p.display_name}
            </p>
            {p.company && (
              <p className="text-xs text-slate-400">{p.company}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Placeholder screens ───────────────────────────────────────────────────────

function CenteredMessage({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-bold text-white">{title}</p>
      {subtitle && <p className="text-lg text-slate-400">{subtitle}</p>}
    </div>
  );
}

// ── ProjectorView ─────────────────────────────────────────────────────────────

export function ProjectorView({ state }: { state: MixerLiveState }) {
  const router = useRouter();

  // Auto-refresh co 10 s
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [router]);

  const { mixerName, mixerStatus, roundsCount, activeRound } = state;
  const isWaiting  = mixerStatus === "draft" || mixerStatus === "generated" || mixerStatus === "locked";
  const isFinished = mixerStatus === "finished";

  // Compute a responsive column count for the table grid
  const tableCount = activeRound?.tables.length ?? 0;
  const colClass =
    tableCount <= 2 ? "grid-cols-1 sm:grid-cols-2" :
    tableCount <= 4 ? "grid-cols-2" :
    tableCount <= 6 ? "grid-cols-2 lg:grid-cols-3" :
                      "grid-cols-3";

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 p-6 gap-6">
      {/* ── Header ── */}
      <header className="flex items-center justify-between gap-6 border-b border-slate-800 pb-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Business Mixer
          </p>
          <h1 className="text-3xl font-bold text-white leading-tight">{mixerName}</h1>
        </div>

        {activeRound && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Runda
            </p>
            <p className="text-5xl font-black leading-none text-indigo-400">
              {activeRound.roundNumber}
              <span className="text-2xl font-semibold text-slate-600">
                /{roundsCount}
              </span>
            </p>
            {activeRound.startedAt && (
              <Countdown
                startedAt={activeRound.startedAt}
                roundMinutes={state.roundMinutes}
              />
            )}
          </div>
        )}

        {isWaiting && (
          <p className="shrink-0 text-xl font-semibold text-slate-500">
            Oczekiwanie na start
          </p>
        )}
        {isFinished && (
          <p className="shrink-0 text-xl font-semibold text-slate-500">
            Zakończony
          </p>
        )}
      </header>

      {/* ── Body ── */}
      {isWaiting && (
        <CenteredMessage
          title="Mixer zaraz się rozpocznie"
          subtitle={mixerName}
        />
      )}

      {isFinished && (
        <CenteredMessage
          title="Mixer zakończony"
          subtitle="Dziękujemy za udział!"
        />
      )}

      {activeRound && (
        <div className={`grid gap-4 ${colClass}`}>
          {activeRound.tables.map((table) => (
            <TableCard key={table.tableNumber} table={table} />
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="mt-auto pt-4 text-center text-[10px] text-slate-700">
        odświeżanie co 10 s
      </footer>
    </div>
  );
}
