"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronUp, EyeOff, Plus, Star, Trash2, X } from "lucide-react";
import type { OrganizerEngagement, PollView } from "@/lib/engagement";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, type QuestionStatus } from "@/lib/engagement-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createPoll,
  deletePoll,
  setPollStatus,
  setQuestionStatus,
  type EngagementAdminState,
} from "../actions";

const REFRESH_MS = 15_000;
const idle: EngagementAdminState = { status: "idle" };

const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  pending: "Na liście",
  selected: "Teraz omawiane",
  answered: "Odpowiedziane",
  hidden: "Ukryte",
};

export function EngagementManager({
  eventId,
  sessionId,
  engagement,
}: {
  eventId: string;
  sessionId: string;
  engagement: OrganizerEngagement;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <PollsSection eventId={eventId} sessionId={sessionId} polls={engagement.polls} />
      <QuestionsSection eventId={eventId} questions={engagement.questions} />
      <RatingsSection engagement={engagement} />
    </div>
  );
}

function useAdminAction() {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<EngagementAdminState>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
    });
  return { isPending, run };
}

// ── Ankiety ────────────────────────────────────────────────────────────────

function PollsSection({
  eventId,
  sessionId,
  polls,
}: {
  eventId: string;
  sessionId: string;
  polls: PollView[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ankiety</CardTitle>
        <CardDescription>
          Otwarta ankieta pojawia się uczestnikom na stronie sesji i na ekranie rzutnika. Naraz
          może być otwarta jedna.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <NewPollForm eventId={eventId} sessionId={sessionId} />
        {polls.length > 0 && (
          <ul className="flex flex-col gap-4">
            {polls.map((p) => (
              <PollItem key={p.id} eventId={eventId} poll={p} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewPollForm({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [optionCount, setOptionCount] = useState(POLL_MIN_OPTIONS);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: EngagementAdminState, formData: FormData) => {
      const res = await createPoll(eventId, sessionId, prev, formData);
      if (res.status === "success") {
        setOptionCount(POLL_MIN_OPTIONS);
        setFormKey((k) => k + 1);
      }
      return res;
    },
    idle,
  );

  return (
    <form key={formKey} ref={formRef} action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="poll-question">Nowa ankieta</Label>
        <Input id="poll-question" name="question" required maxLength={300} placeholder="Np. Z jakiego narzędzia korzystasz najczęściej?" />
      </div>
      <div className="flex flex-col gap-2">
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
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Tworzenie…" : "Utwórz ankietę"}
        </Button>
        {state.message && (
          <p className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

const POLL_STATUS_LABEL = { draft: "Szkic", open: "Otwarta", closed: "Zamknięta" } as const;

function PollItem({ eventId, poll }: { eventId: string; poll: PollView }) {
  const { isPending, run } = useAdminAction();
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{poll.question}</p>
        <Badge variant={poll.status === "open" ? "success" : "secondary"}>{POLL_STATUS_LABEL[poll.status]}</Badge>
      </div>
      <ul className="flex flex-col gap-1.5">
        {poll.results.map((o) => (
          <li key={o.id} className="relative overflow-hidden rounded-md border px-3 py-1.5 text-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${o.percent}%` }} />
            <span className="relative flex justify-between gap-3">
              <span>{o.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {o.votes} · {o.percent}%
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted-foreground">{poll.total} głosów</span>
        {poll.status !== "open" && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => setPollStatus(eventId, poll.id, "open"))}>
            {poll.status === "closed" ? "Otwórz ponownie" : "Otwórz"}
          </Button>
        )}
        {poll.status === "open" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setPollStatus(eventId, poll.id, "closed"))}>
            Zamknij
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          aria-label="Usuń ankietę"
          onClick={() => {
            if (window.confirm("Usunąć ankietę razem z głosami?")) run(() => deletePoll(eventId, poll.id));
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

// ── Pytania ────────────────────────────────────────────────────────────────

function QuestionsSection({
  eventId,
  questions,
}: {
  eventId: string;
  questions: OrganizerEngagement["questions"];
}) {
  const visible = questions.filter((q) => q.status !== "hidden").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pytania ({visible})</CardTitle>
        <CardDescription>
          Nowe pytania są od razu widoczne dla uczestników. „Teraz omawiane” wyróżnia pytanie na
          ekranie rzutnika. Autora pytań anonimowych widzisz tylko Ty.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak pytań.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {questions.map((q) => (
              <QuestionRow key={q.id} eventId={eventId} question={q} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionRow({
  eventId,
  question,
}: {
  eventId: string;
  question: OrganizerEngagement["questions"][number];
}) {
  const { isPending, run } = useAdminAction();
  const set = (status: QuestionStatus) => run(() => setQuestionStatus(eventId, question.id, status));
  const hidden = question.status === "hidden";

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start",
        question.status === "selected" && "border-primary bg-primary/5",
        hidden && "opacity-50",
      )}
    >
      <div className="flex w-12 shrink-0 items-center gap-1 text-sm tabular-nums text-muted-foreground sm:flex-col sm:gap-0">
        <ChevronUp className="size-4" />
        {question.vote_count}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="whitespace-pre-line break-words text-sm">{question.content}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{question.author}</span>
          {question.target && <Badge variant="indigo">→ {question.target}</Badge>}
          {question.is_anonymous && <Badge variant="outline">anonimowo</Badge>}
          {question.status !== "pending" && (
            <Badge variant={question.status === "selected" ? "indigo" : "secondary"}>
              {QUESTION_STATUS_LABEL[question.status]}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {!hidden && question.status !== "selected" && question.status !== "answered" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => set("selected")}>
            Teraz omawiane
          </Button>
        )}
        {!hidden && question.status !== "answered" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => set("answered")}>
            Odpowiedziane
          </Button>
        )}
        {question.status === "answered" && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => set("pending")}>
            Przywróć
          </Button>
        )}
        {hidden ? (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => set("pending")}>
            Pokaż
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={isPending} aria-label="Ukryj pytanie" onClick={() => set("hidden")}>
            <EyeOff className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

// ── Oceny ──────────────────────────────────────────────────────────────────

function RatingsSection({ engagement }: { engagement: OrganizerEngagement }) {
  const { rating, feedback } = engagement;
  const max = Math.max(1, ...rating.distribution);
  const comments = feedback.filter((f) => f.comment);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Oceny sesji</CardTitle>
        <CardDescription>Uczestnicy mogą ocenić sesję po jej rozpoczęciu.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {rating.count === 0 ? (
          <p className="text-sm text-muted-foreground">Brak ocen.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center">
              <span className="text-4xl font-semibold tabular-nums">{rating.average?.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">{rating.count} ocen</span>
            </div>
            <ul className="flex min-w-48 flex-1 flex-col gap-1">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex w-6 items-center gap-0.5 tabular-nums">
                    {n}
                    <Star className="size-3 fill-yellow-400 text-yellow-400" />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full bg-yellow-400"
                      style={{ width: `${(rating.distribution[n - 1] / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums text-muted-foreground">{rating.distribution[n - 1]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {comments.length > 0 && (
          <ul className="flex flex-col gap-3">
            {comments.map((f, i) => (
              <li key={i} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    {f.rating}
                    <Star className="size-3 fill-yellow-400 text-yellow-400" />
                  </span>
                  <span>{f.author}</span>
                </div>
                <p className="whitespace-pre-line break-words">{f.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
