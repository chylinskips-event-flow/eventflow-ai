"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronUp, MessageCircleQuestion, Star } from "lucide-react";
import type { ParticipantEngagement } from "@/lib/engagement";
import {
  FEEDBACK_COMMENT_MAX_LENGTH,
  MAX_QUESTIONS_PER_ATTENDEE,
  QUESTION_MAX_LENGTH,
} from "@/lib/engagement-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  answerPoll,
  askQuestion,
  rateSession,
  toggleQuestionVote,
  type EngagementActionState,
} from "./actions";

const REFRESH_MS = 10_000;
const idle: EngagementActionState = { status: "idle" };

/** Odświeża dane serwera co 10 s, gdy karta jest widoczna (bez Realtime — jak Business Mixer). */
function useAutoRefresh(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, router]);
}

export function SessionEngagement({
  slug,
  sessionId,
  engagement,
  canAsk,
  canRate,
  autoRefresh,
  speakers,
}: {
  slug: string;
  sessionId: string;
  engagement: ParticipantEngagement;
  /** Prelegenci sesji — przy ≥ 2 uczestnik może skierować pytanie do konkretnej osoby. */
  speakers: { id: string; name: string }[];
  canAsk: boolean;
  canRate: boolean;
  autoRefresh: boolean;
}) {
  useAutoRefresh(autoRefresh);

  return (
    <div className="flex flex-col gap-5">
      {engagement.poll && <PollCard slug={slug} sessionId={sessionId} poll={engagement.poll} />}
      <QuestionsCard
        slug={slug}
        sessionId={sessionId}
        questions={engagement.questions}
        speakers={speakers}
        canAsk={canAsk && engagement.myQuestionCount < MAX_QUESTIONS_PER_ATTENDEE}
        askClosedReason={
          !canAsk
            ? "Pytania można zadawać przed wydarzeniem i w jego trakcie."
            : engagement.myQuestionCount >= MAX_QUESTIONS_PER_ATTENDEE
              ? `Zadano już ${MAX_QUESTIONS_PER_ATTENDEE} pytań — to limit na jedną sesję.`
              : null
        }
      />
      {canRate && (
        <RatingCard slug={slug} sessionId={sessionId} myFeedback={engagement.myFeedback} />
      )}
    </div>
  );
}

// ── Ankieta ────────────────────────────────────────────────────────────────

function PollCard({
  slug,
  sessionId,
  poll,
}: {
  slug: string;
  sessionId: string;
  poll: NonNullable<ParticipantEngagement["poll"]>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answered = poll.myOptionId !== null;

  function vote(optionId: string) {
    setError(null);
    startTransition(async () => {
      const res = await answerPoll(slug, sessionId, poll.id, optionId);
      if (res.status === "error") setError(res.message ?? "Nie udało się zapisać odpowiedzi.");
    });
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          Ankieta
        </CardTitle>
        <CardDescription className="text-base text-foreground">{poll.question}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {poll.results.map((o) => {
          const mine = poll.myOptionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={isPending}
              onClick={() => vote(o.id)}
              aria-pressed={mine}
              className={cn(
                "relative overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                mine ? "border-primary" : "hover:bg-accent",
              )}
            >
              {answered && (
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0", mine ? "bg-primary/20" : "bg-muted")}
                  style={{ width: `${o.percent}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-3">
                <span className={cn(mine && "font-medium")}>{o.label}</span>
                {answered && <span className="tabular-nums text-muted-foreground">{o.percent}%</span>}
              </span>
            </button>
          );
        })}
        <p className="text-xs text-muted-foreground">
          {answered
            ? `${poll.total} ${poll.total === 1 ? "głos" : "głosów"} · możesz zmienić odpowiedź, dopóki ankieta jest otwarta.`
            : "Wybierz odpowiedź, aby zobaczyć wyniki."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Pytania ────────────────────────────────────────────────────────────────

function QuestionsCard({
  slug,
  sessionId,
  questions,
  canAsk,
  askClosedReason,
  speakers,
}: {
  slug: string;
  sessionId: string;
  questions: ParticipantEngagement["questions"];
  speakers: { id: string; name: string }[];
  canAsk: boolean;
  askClosedReason: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [length, setLength] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: EngagementActionState, formData: FormData) => {
      const res = await askQuestion(slug, sessionId, prev, formData);
      if (res.status === "success") {
        formRef.current?.reset();
        setLength(0);
      }
      return res;
    },
    idle,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircleQuestion className="size-5 text-primary" />
          Pytania do prelegenta
        </CardTitle>
        <CardDescription>Zadaj pytanie albo zagłosuj na pytania innych — najpopularniejsze trafią na górę.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {canAsk ? (
          <form ref={formRef} action={formAction} className="flex flex-col gap-3">
            <Textarea
              name="content"
              required
              maxLength={QUESTION_MAX_LENGTH}
              placeholder="Twoje pytanie…"
              onChange={(e) => setLength(e.target.value.length)}
              aria-label="Treść pytania"
            />
            {speakers.length >= 2 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`target-${sessionId}`}>Do kogo (opcjonalnie)</Label>
                <select
                  id={`target-${sessionId}`}
                  name="target_speaker_id"
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Do wszystkich prelegentów</option>
                  {speakers.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox id={`anon-${sessionId}`} name="anonymous" />
                <Label htmlFor={`anon-${sessionId}`} className="font-normal">
                  Zadaj anonimowo
                </Label>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {length}/{QUESTION_MAX_LENGTH}
              </span>
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Wysyłanie…" : "Wyślij pytanie"}
            </Button>
            {state.message && (
              <p
                role={state.status === "error" ? "alert" : "status"}
                className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}
              >
                {state.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Przy pytaniu anonimowym inni uczestnicy nie zobaczą Twojego imienia. Organizator je widzi.
            </p>
          </form>
        ) : (
          askClosedReason && <p className="text-sm text-muted-foreground">{askClosedReason}</p>
        )}

        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nie ma jeszcze pytań. Zadaj pierwsze!</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {questions.map((q) => (
              <QuestionItem key={q.id} slug={slug} sessionId={sessionId} question={q} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionItem({
  slug,
  sessionId,
  question,
}: {
  slug: string;
  sessionId: string;
  question: ParticipantEngagement["questions"][number];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function vote() {
    setError(null);
    startTransition(async () => {
      const res = await toggleQuestionVote(slug, sessionId, question.id);
      if (res.status === "error") setError(res.message ?? "Nie udało się zapisać głosu.");
    });
  }

  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border p-3",
        question.status === "selected" && "border-primary bg-primary/5",
        question.status === "answered" && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={vote}
        disabled={isPending || question.is_mine || question.status === "answered"}
        aria-pressed={question.has_voted}
        aria-label={question.has_voted ? "Cofnij głos" : "Zagłosuj na pytanie"}
        title={question.is_mine ? "To Twoje pytanie" : undefined}
        className={cn(
          "flex h-fit w-11 shrink-0 flex-col items-center rounded-md border py-1 text-sm tabular-nums transition-colors disabled:cursor-default",
          question.has_voted ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
        )}
      >
        <ChevronUp className="size-4" />
        {question.vote_count}
      </button>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="whitespace-pre-line break-words text-sm">{question.content}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{question.author ?? "Anonim"}</span>
          {question.target && <Badge variant="indigo">→ {question.target}</Badge>}
          {question.is_mine && <Badge variant="outline">Twoje</Badge>}
          {question.status === "selected" && <Badge variant="indigo">Teraz omawiane</Badge>}
          {question.status === "answered" && <Badge variant="secondary">Odpowiedziane</Badge>}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

// ── Ocena ──────────────────────────────────────────────────────────────────

function RatingCard({
  slug,
  sessionId,
  myFeedback,
}: {
  slug: string;
  sessionId: string;
  myFeedback: ParticipantEngagement["myFeedback"];
}) {
  const [state, formAction, isPending] = useActionState(
    rateSession.bind(null, slug, sessionId),
    idle,
  );
  const [rating, setRating] = useState(myFeedback?.rating ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="size-5 text-primary" />
          Oceń sesję
        </CardTitle>
        <CardDescription>
          {myFeedback ? "Dziękujemy! Możesz zmienić swoją ocenę." : "Twoja opinia pomoże organizatorowi."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="rating" value={rating || ""} />
          <div role="radiogroup" aria-label="Ocena od 1 do 5" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} na 5`}
                onClick={() => setRating(n)}
                className="rounded p-1"
              >
                <Star
                  className={cn(
                    "size-8 transition-colors",
                    n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
                  )}
                />
              </button>
            ))}
          </div>
          <Textarea
            name="comment"
            maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
            defaultValue={myFeedback?.comment ?? ""}
            placeholder="Komentarz (opcjonalnie)"
            aria-label="Komentarz do oceny"
          />
          <Button type="submit" disabled={isPending || rating === 0}>
            {isPending ? "Zapisywanie…" : myFeedback ? "Zaktualizuj ocenę" : "Wyślij ocenę"}
          </Button>
          {state.message && (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}
            >
              {state.message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
