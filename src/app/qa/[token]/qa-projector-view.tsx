"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { QaProjectorState } from "@/lib/engagement";

const REFRESH_MS = 5_000;

export function QaProjectorView({
  state,
  joinUrl,
  qrDataUrl,
}: {
  state: QaProjectorState;
  joinUrl: string;
  qrDataUrl: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const { selected, questions, poll } = state;
  const displayUrl = joinUrl.replace(/^https?:\/\//, "");

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-slate-950 p-6 text-white lg:p-10">
      <header className="flex items-start justify-between gap-6 border-b border-slate-800 pb-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            {state.eventName}
            {state.room ? ` · ${state.room}` : ""}
          </p>
          <h1 className="text-3xl font-bold leading-tight lg:text-4xl">{state.sessionTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-indigo-300">Zadaj pytanie</p>
            <p className="max-w-[260px] break-all text-xs text-slate-400">{displayUrl}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Kod QR do pytań w tej sesji"
            width={120}
            height={120}
            className="size-24 rounded-lg bg-white p-1 lg:size-32"
          />
        </div>
      </header>

      <div className={poll ? "grid flex-1 gap-6 lg:grid-cols-[3fr_2fr]" : "flex flex-1 flex-col gap-6"}>
        <section className="flex flex-col gap-4">
          {selected && (
            <div className="rounded-2xl border-2 border-indigo-400 bg-indigo-500/10 p-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-indigo-300">
                Teraz omawiane
              </p>
              <p className="text-3xl font-semibold leading-snug lg:text-4xl">{selected.content}</p>
              <p className="mt-3 text-base text-slate-400">
                {selected.author ?? "Anonim"}
                {selected.target ? ` → ${selected.target}` : ""} · {selected.vote_count} głosów
              </p>
            </div>
          )}

          {questions.length === 0 && !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-4xl font-bold">Czekamy na pytania</p>
              <p className="text-lg text-slate-400">Zeskanuj kod QR i zadaj pytanie prelegentowi.</p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {questions.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
                >
                  <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-slate-800 py-1.5 text-2xl font-bold tabular-nums text-indigo-300">
                    {q.vote_count}
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">głosy</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl leading-snug lg:text-2xl">{q.content}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {q.author ?? "Anonim"}
                      {q.target && <span className="text-indigo-300"> → {q.target}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {poll && (
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Ankieta</p>
            <p className="text-2xl font-semibold leading-snug">{poll.question}</p>
            <ul className="flex flex-col gap-3">
              {poll.results.map((o) => (
                <li key={o.id} className="relative overflow-hidden rounded-lg bg-slate-800 px-4 py-3">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-indigo-500/40 transition-all duration-700"
                    style={{ width: `${o.percent}%` }}
                  />
                  <span className="relative flex justify-between gap-4 text-lg">
                    <span>{o.label}</span>
                    <span className="font-semibold tabular-nums">{o.percent}%</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-500">{poll.total} głosów</p>
          </section>
        )}
      </div>
    </div>
  );
}
