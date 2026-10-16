"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { LeadAuditEntry, PartnerQuestion } from "@/lib/partner-leads";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTOR_LABELS,
  QUESTION_KIND_LABELS,
  QUESTION_STATUS,
} from "@/lib/partner-leads-core";
import { formatDateTime, pluralizePl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { reviewPartnerQuestion } from "./actions";

/** #10 Faza B — akceptacja pytań przy stoisku + dziennik dostępu do leadów. */
export function PartnerLeadsAdmin({
  eventId,
  partnerId,
  questions,
  leadCount,
  audit,
  timezone,
}: {
  eventId: string;
  partnerId: string;
  questions: PartnerQuestion[];
  leadCount: number;
  audit: LeadAuditEntry[];
  timezone: string | null;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pytania przy stoisku</CardTitle>
          <CardDescription>
            Partner pyta odwiedzających o potrzeby. Uczestnik odpowiada dobrowolnie i tylko z osobną zgodą na
            przekazanie danych partnerowi. Pytanie pojawi się przy stoisku dopiero po Twojej akceptacji.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Kontakty przekazane partnerowi: <strong className="text-foreground">{leadCount}</strong> (dane widzi tylko partner).
          </p>
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Partner nie dodał pytań.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {questions.map((q) => (
                <QuestionReviewRow key={q.id} eventId={eventId} partnerId={partnerId} question={q} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dziennik: zgody i dostęp do kontaktów</CardTitle>
          <CardDescription>
            Ostatnie {audit.length} {pluralizePl(audit.length, ["wpis", "wpisy", "wpisów"])}. Wpisów nie da się edytować ani usunąć.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wpisów.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                  <span>
                    <span className="text-muted-foreground">{AUDIT_ACTOR_LABELS[a.actor_type] ?? a.actor_type}:</span>{" "}
                    {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                    {typeof a.metadata.count === "number" && ` (${a.metadata.count})`}
                    {typeof a.metadata.prompt === "string" && <span className="text-muted-foreground"> — „{a.metadata.prompt}”</span>}
                  </span>
                  <time className="text-xs text-muted-foreground tabular-nums">{formatDateTime(a.created_at, timezone)}</time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function QuestionReviewRow({ eventId, partnerId, question }: { eventId: string; partnerId: string; question: PartnerQuestion }) {
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const s = QUESTION_STATUS[question.status];

  const run = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await reviewPartnerQuestion(eventId, partnerId, question.id, decision, note);
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
      else {
        if (res.message) toast.success(res.message);
        setRejecting(false);
        setNote("");
      }
    });

  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-3", question.status === "pending" && "border-amber-400")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{question.prompt}</p>
          <p className="text-xs text-muted-foreground">
            {QUESTION_KIND_LABELS[question.kind]}
            {question.kind === "single_choice" && `: ${question.options.map((o) => o.label).join(" · ")}`}
          </p>
          {question.status === "rejected" && question.review_note && (
            <p className="mt-1 text-xs text-muted-foreground">Uwaga: {question.review_note}</p>
          )}
        </div>
        <Badge variant={s.variant}>{s.label}</Badge>
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Uwaga dla partnera (opcjonalnie)"
            maxLength={1000}
            className="sm:flex-1"
          />
          <div className="flex gap-1">
            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run("rejected")}>
              Odrzuć
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setRejecting(false)}>
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {question.status !== "approved" && (
            <Button size="sm" disabled={isPending} onClick={() => run("approved")}>
              Akceptuj
            </Button>
          )}
          {question.status !== "rejected" && (
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setRejecting(true)}>
              {question.status === "approved" ? "Wycofaj" : "Odrzuć"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
