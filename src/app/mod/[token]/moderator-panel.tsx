"use client";

import { useActionState, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Check, ChevronUp, EyeOff, MonitorPlay, Plus, Undo2, X } from "lucide-react";
import type { ModeratorEngagement, PollView } from "@/lib/engagement";
import type { ModeratorPartner } from "@/lib/moderator";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, type QuestionStatus } from "@/lib/engagement-core";
import { currentAndNext, formatCountdown } from "@/lib/moderator-core";
import { partnerTierLabel } from "@/lib/partner-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  moderatorCreatePoll,
  moderatorSetAlertAnnounced,
  moderatorSetPollStatus,
  moderatorSetQuestionStatus,
  type ModeratorActionState,
} from "./actions";

const REFRESH_MS = 10_000;
const idle: ModeratorActionState = { status: "idle" };

export type PanelSession = {
  id: string;
  title: string;
  description: string | null;
  room: string | null;
  track: string | null;
  starts_at: string | null;
  ends_at: string | null;
  day: string | null;
  time: string | null;
  speakers: { id: string; name: string; company: string | null; photo_url: string | null; role: string }[];
  note: string;
};

type AlertView = { id: string; content: string; room: string | null; is_important: boolean; announced: boolean };

// Zegar tylko po stronie klienta (bez rozjazdu hydratacji): null na serwerze.
function subscribeClock(cb: () => void) {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
}
let clockValue = 0;
function readClock() {
  const now = Math.floor(Date.now() / 15_000) * 15_000;
  if (now !== clockValue) clockValue = now;
  return clockValue;
}
function useNow(): number | null {
  return useSyncExternalStore(subscribeClock, readClock, () => null);
}

function useAction() {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<ModeratorActionState>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
    });
  return { isPending, run };
}

export function ModeratorPanel({
  token,
  eventName,
  linkLabel,
  room,
  canProject,
  sessions,
  focusId,
  engagement,
  projectorToken,
  alerts,
  script,
  partnerGroups,
}: {
  token: string;
  eventName: string;
  linkLabel: string;
  room: string | null;
  canProject: boolean;
  sessions: PanelSession[];
  focusId: string | null;
  engagement: ModeratorEngagement | null;
  projectorToken: string | null;
  alerts: AlertView[];
  script: string;
  partnerGroups: { tier: string | null; items: ModeratorPartner[] }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("session");
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const focus = sessions.find((s) => s.id === focusId) ?? null;
  const selectSession = (id: string) => {
    setTab("session");
    router.push(`?s=${id}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{eventName}</p>
            <p className="truncate font-semibold">Panel prowadzącego · {linkLabel}</p>
          </div>
          <Badge variant="secondary" className="shrink-0">{room ?? "Wszystkie sale"}</Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-16">
        <AlertsBlock token={token} alerts={alerts} />
        <NowNext sessions={sessions} onSelect={selectSession} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="session">Sesja</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="script">Scenariusz</TabsTrigger>
            <TabsTrigger value="partners">Partnerzy</TabsTrigger>
          </TabsList>

          <TabsContent value="session" className="mt-4">
            {focus && engagement ? (
              <SessionTab
                token={token}
                session={focus}
                engagement={engagement}
                projectorToken={canProject ? projectorToken : null}
              />
            ) : (
              <Empty>Brak sesji w agendzie{room ? ` dla sali ${room}` : ""}.</Empty>
            )}
          </TabsContent>
          <TabsContent value="agenda" className="mt-4">
            <AgendaTab sessions={sessions} focusId={focusId} onSelect={selectSession} />
          </TabsContent>
          <TabsContent value="script" className="mt-4">
            {script ? (
              <Panel>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed">{script}</p>
              </Panel>
            ) : (
              <Empty>Organizator nie dodał jeszcze scenariusza.</Empty>
            )}
          </TabsContent>
          <TabsContent value="partners" className="mt-4">
            <PartnersTab groups={partnerGroups} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-xl border bg-background p-4", className)}>{children}</section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// ── Komunikaty ─────────────────────────────────────────────────────────────

function AlertsBlock({ token, alerts }: { token: string; alerts: AlertView[] }) {
  const pending = alerts.filter((a) => !a.announced).sort((a, b) => Number(b.is_important) - Number(a.is_important));
  const done = alerts.filter((a) => a.announced);
  if (alerts.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      {pending.map((a) => (
        <AlertItem key={a.id} token={token} alert={a} />
      ))}
      {done.length > 0 && (
        <details className="rounded-xl border bg-background px-4 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ogłoszone ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {done.map((a) => (
              <AlertItem key={a.id} token={token} alert={a} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function AlertItem({ token, alert }: { token: string; alert: AlertView }) {
  const { isPending, run } = useAction();
  if (alert.announced) {
    return (
      <li className="flex items-start gap-3 text-muted-foreground">
        <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
        <p className="flex-1 whitespace-pre-line break-words">{alert.content}</p>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          aria-label="Cofnij"
          onClick={() => run(() => moderatorSetAlertAnnounced(token, alert.id, false))}
        >
          <Undo2 className="size-4" />
        </Button>
      </li>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start",
        alert.is_important
          ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
          : "bg-background",
      )}
    >
      <Bell className={cn("hidden size-5 shrink-0 sm:block", alert.is_important ? "text-amber-600" : "text-muted-foreground")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {alert.is_important ? "Ważne — do ogłoszenia" : "Do ogłoszenia"}
          {alert.room ? ` · ${alert.room}` : ""}
        </p>
        <p className="whitespace-pre-line break-words text-base">{alert.content}</p>
      </div>
      <Button
        size="sm"
        disabled={isPending}
        className="shrink-0"
        onClick={() => run(() => moderatorSetAlertAnnounced(token, alert.id, true))}
      >
        <Check className="size-4" />
        Ogłoszone
      </Button>
    </div>
  );
}

// ── Teraz / następna ───────────────────────────────────────────────────────

function NowNext({ sessions, onSelect }: { sessions: PanelSession[]; onSelect: (id: string) => void }) {
  const now = useNow();
  if (now === null) return null;
  const { current, next } = currentAndNext(sessions, now);
  if (!current && !next) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {current && (
        <button
          type="button"
          onClick={() => onSelect(current.id)}
          className="rounded-xl border border-green-300 bg-green-50 p-3 text-left dark:bg-green-950/30"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
            Teraz{current.ends_at ? ` · koniec ${formatCountdown(new Date(current.ends_at).getTime() - now)}` : ""}
          </p>
          <p className="mt-1 line-clamp-2 font-medium">{current.title}</p>
          <p className="text-xs text-muted-foreground">{current.time}{current.room ? ` · ${current.room}` : ""}</p>
        </button>
      )}
      {next && (
        <button type="button" onClick={() => onSelect(next.id)} className="rounded-xl border bg-background p-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Następna · {formatCountdown(new Date(next.starts_at as string).getTime() - now)}
          </p>
          <p className="mt-1 line-clamp-2 font-medium">{next.title}</p>
          <p className="text-xs text-muted-foreground">{next.time}{next.room ? ` · ${next.room}` : ""}</p>
        </button>
      )}
    </div>
  );
}

// ── Sesja: prelegenci, notatka, ankiety, Q&A ───────────────────────────────

function SessionTab({
  token,
  session,
  engagement,
  projectorToken,
}: {
  token: string;
  session: PanelSession;
  engagement: ModeratorEngagement;
  projectorToken: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{session.title}</h2>
            <p className="text-sm text-muted-foreground">
              {[session.day, session.time, session.room].filter(Boolean).join(" · ") || "Bez daty"}
            </p>
          </div>
          {projectorToken && (
            <Button size="sm" variant="outline" asChild className="shrink-0">
              <a href={`/qa/${projectorToken}`} target="_blank" rel="noopener noreferrer">
                <MonitorPlay className="size-4" />
                Rzutnik
              </a>
            </Button>
          )}
        </div>
        <SpeakerList speakers={session.speakers} />
        {session.note && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Notatka od organizatora
            </p>
            <p className="whitespace-pre-line break-words">{session.note}</p>
          </div>
        )}
      </Panel>

      <PollsBlock token={token} sessionId={session.id} polls={engagement.polls} />
      <QuestionsBlock token={token} questions={engagement.questions} />
    </div>
  );
}

function SpeakerList({ speakers }: { speakers: PanelSession["speakers"] }) {
  if (speakers.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {speakers.map((sp) => (
        <li key={sp.id} className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm">
          {sp.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sp.photo_url} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {sp.name.charAt(0)}
            </span>
          )}
          <span>
            <span className="font-medium">{sp.name}</span>
            {sp.company && <span className="text-muted-foreground"> · {sp.company}</span>}
            {sp.role === "moderator" && <span className="text-muted-foreground"> · moderator</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const POLL_STATUS_LABEL = { draft: "Szkic", open: "Otwarta", closed: "Zamknięta" } as const;

function PollsBlock({ token, sessionId, polls }: { token: string; sessionId: string; polls: PollView[] }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Ankiety</h3>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            Nowa ankieta
          </Button>
        )}
      </div>
      {showForm && <NewPollForm token={token} sessionId={sessionId} onDone={() => setShowForm(false)} />}
      {polls.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">Brak ankiet w tej sesji.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {polls.map((p) => (
            <PollItem key={p.id} token={token} poll={p} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NewPollForm({ token, sessionId, onDone }: { token: string; sessionId: string; onDone: () => void }) {
  const [optionCount, setOptionCount] = useState(POLL_MIN_OPTIONS);
  const [state, formAction, isPending] = useActionState(
    async (prev: ModeratorActionState, formData: FormData) => {
      const res = await moderatorCreatePoll(token, sessionId, prev, formData);
      if (res.status === "success") {
        toast.success(res.message ?? "Zapisano.");
        onDone();
      }
      return res;
    },
    idle,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
      <Input name="question" required maxLength={300} placeholder="Pytanie ankiety" aria-label="Pytanie ankiety" />
      {Array.from({ length: optionCount }, (_, i) => (
        <div key={i} className="flex gap-2">
          <Input name="option" maxLength={120} placeholder={`Odpowiedź ${i + 1}`} required={i < POLL_MIN_OPTIONS} aria-label={`Odpowiedź ${i + 1}`} />
          {i >= POLL_MIN_OPTIONS && i === optionCount - 1 && (
            <Button type="button" variant="ghost" size="icon" aria-label="Usuń odpowiedź" onClick={() => setOptionCount((n) => n - 1)}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {optionCount < POLL_MAX_OPTIONS && (
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setOptionCount((n) => n + 1)}>
          <Plus className="size-4" />
          Dodaj odpowiedź
        </Button>
      )}
      <div className="flex items-center gap-2">
        <Checkbox id={`open-now-${sessionId}`} name="open_now" defaultChecked />
        <Label htmlFor={`open-now-${sessionId}`} className="font-normal">
          Otwórz od razu (zamyka inną otwartą ankietę)
        </Label>
      </div>
      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Zapisywanie…" : "Utwórz"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
      </div>
    </form>
  );
}

function PollItem({ token, poll }: { token: string; poll: PollView }) {
  const { isPending, run } = useAction();
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-3", poll.status === "open" && "border-green-400")}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{poll.question}</p>
        <Badge variant={poll.status === "open" ? "success" : "secondary"}>{POLL_STATUS_LABEL[poll.status]}</Badge>
      </div>
      <ul className="flex flex-col gap-1">
        {poll.results.map((o) => (
          <li key={o.id} className="relative overflow-hidden rounded-md border px-3 py-1.5 text-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${o.percent}%` }} />
            <span className="relative flex justify-between gap-3">
              <span>{o.label}</span>
              <span className="tabular-nums text-muted-foreground">{o.votes} · {o.percent}%</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <span className="mr-auto text-xs text-muted-foreground">{poll.total} głosów</span>
        {poll.status === "open" ? (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => moderatorSetPollStatus(token, poll.id, "closed"))}>
            Zamknij
          </Button>
        ) : (
          <Button size="sm" disabled={isPending} onClick={() => run(() => moderatorSetPollStatus(token, poll.id, "open"))}>
            {poll.status === "closed" ? "Otwórz ponownie" : "Otwórz"}
          </Button>
        )}
      </div>
    </li>
  );
}

const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  pending: "Na liście",
  selected: "Teraz omawiane",
  answered: "Odpowiedziane",
  hidden: "Ukryte",
};

function QuestionsBlock({ token, questions }: { token: string; questions: ModeratorEngagement["questions"] }) {
  const visible = questions.filter((q) => q.status !== "hidden");
  const hidden = questions.filter((q) => q.status === "hidden");
  return (
    <Panel className="flex flex-col gap-3">
      <h3 className="font-semibold">Pytania ({visible.length})</h3>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak pytań. Uczestnicy zadają je na stronie sesji w agendzie.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((q) => (
            <QuestionItem key={q.id} token={token} question={q} />
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ukryte ({hidden.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {hidden.map((q) => (
              <QuestionItem key={q.id} token={token} question={q} />
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function QuestionItem({ token, question }: { token: string; question: ModeratorEngagement["questions"][number] }) {
  const { isPending, run } = useAction();
  const set = (status: QuestionStatus) => run(() => moderatorSetQuestionStatus(token, question.id, status));
  const { status } = question;

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        status === "selected" && "border-primary bg-primary/5",
        (status === "answered" || status === "hidden") && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex w-9 shrink-0 flex-col items-center text-sm tabular-nums text-muted-foreground">
          <ChevronUp className="size-4" />
          {question.vote_count}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="whitespace-pre-line break-words">{question.content}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{question.author ?? "Anonim"}</span>
            {question.target && <Badge variant="indigo">→ {question.target}</Badge>}
            {status !== "pending" && (
              <Badge variant={status === "selected" ? "indigo" : "secondary"}>{QUESTION_STATUS_LABEL[status]}</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 pl-12">
        {status === "pending" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => set("selected")}>
            Teraz omawiane
          </Button>
        )}
        {(status === "pending" || status === "selected") && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => set("answered")}>
            Odpowiedziane
          </Button>
        )}
        {(status === "answered" || status === "hidden") && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => set("pending")}>
            {status === "hidden" ? "Pokaż" : "Przywróć"}
          </Button>
        )}
        {status !== "hidden" && (
          <Button size="sm" variant="ghost" disabled={isPending} aria-label="Ukryj pytanie" onClick={() => set("hidden")}>
            <EyeOff className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

// ── Agenda sali ────────────────────────────────────────────────────────────

function AgendaTab({
  sessions,
  focusId,
  onSelect,
}: {
  sessions: PanelSession[];
  focusId: string | null;
  onSelect: (id: string) => void;
}) {
  const now = useNow();
  if (sessions.length === 0) return <Empty>Brak sesji w agendzie.</Empty>;

  return (
    <ol className="flex flex-col gap-2">
      {sessions.map((s, i) => {
        const dayHeader = s.day && s.day !== sessions[i - 1]?.day ? s.day : null;
        const ended = now !== null && s.ends_at !== null && new Date(s.ends_at).getTime() < now;
        return (
          <li key={s.id} className="flex flex-col gap-2">
            {dayHeader && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dayHeader}</p>}
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-accent/50",
                s.id === focusId && "border-primary",
                ended && "opacity-60",
              )}
            >
              <div className="flex items-baseline gap-3">
                <span className="w-24 shrink-0 text-sm font-medium tabular-nums">{s.time ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.title}</span>
                  {(s.room || s.track) && (
                    <span className="block text-xs text-muted-foreground">{[s.room, s.track].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
              </div>
              {s.speakers.length > 0 && (
                <div className="pl-[6.75rem] text-sm text-muted-foreground">
                  {s.speakers.map((sp) => `${sp.name}${sp.company ? ` (${sp.company})` : ""}${sp.role === "moderator" ? " — moderator" : ""}`).join(", ")}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Sponsorzy i partnerzy ──────────────────────────────────────────────────

function PartnersTab({ groups }: { groups: { tier: string | null; items: ModeratorPartner[] }[] }) {
  if (groups.length === 0) return <Empty>Brak sponsorów i partnerów.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <Panel key={g.tier ?? "none"} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {partnerTierLabel(g.tier) ?? "Partnerzy"}
          </h3>
          <ul className="flex flex-col gap-3">
            {g.items.map((p) => (
              <li key={p.id} className="flex items-start gap-3">
                {p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt="" className="size-12 shrink-0 rounded-md border bg-white object-contain p-1" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted text-lg font-semibold">
                    {p.name.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  {p.booth_location && <p className="text-xs text-muted-foreground">Stoisko: {p.booth_location}</p>}
                  {p.description && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
