"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Eye, Pencil, Trash2 } from "lucide-react";
import type { PartnerQuestion } from "@/lib/partner-leads";
import {
  MAX_QUESTIONS_PER_PARTNER,
  QUESTION_KIND_LABELS,
  QUESTION_OPTIONS_MAX,
  QUESTION_PROMPT_MAX_LENGTH,
  QUESTION_STATUS,
  type PartnerLead,
  type QuestionKind,
} from "@/lib/partner-leads-core";
import { formatDateTime, pluralizePl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PartnerActionState } from "./actions";
import { addPartnerQuestion, deletePartnerQuestion, loadPartnerLeads, resubmitPartnerQuestion } from "./leads-actions";

const idle: PartnerActionState = { status: "idle" };

// ── Pytania przy stoisku ───────────────────────────────────────────────────

export function PartnerQuestionsCard({ partnerId, questions }: { partnerId: string; questions: PartnerQuestion[] }) {
  const full = questions.filter((q) => q.status !== "rejected").length >= MAX_QUESTIONS_PER_PARTNER;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pytania przy stoisku</CardTitle>
        <CardDescription>
          Do {MAX_QUESTIONS_PER_PARTNER} aktywnych, krótkich pytań dla odwiedzających stoisko (np. o potrzeby lub termin zakupu).
          Uczestnik odpowiada dobrowolnie i tylko z osobną zgodą na przekazanie danych. Pytania pojawią się po
          akceptacji organizatora. Bez pytań uczestnik może zostawić sam kontakt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {questions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {questions.map((q) => (
              <QuestionRow key={q.id} partnerId={partnerId} question={q} canResubmit={!full} />
            ))}
          </ul>
        )}

        {full ? (
          <p className="text-sm text-muted-foreground">Osiągnięto limit aktywnych pytań — usuń jedno, aby dodać nowe.</p>
        ) : (
          <QuestionForm
            submitLabel="Wyślij do akceptacji"
            action={(prev, fd) => addPartnerQuestion(partnerId, prev, fd)}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Formularz pytania (nowe albo poprawa odrzuconego). Po udanym zapisie pola są czyszczone
 * (nowy klucz formularza). Przycisk zablokowany na czas zapisu, a dodatkowy ref odcina
 * szybkie podwójne kliknięcie, zanim React zdąży ustawić stan „pending”.
 */
function QuestionForm({
  initial,
  submitLabel,
  action,
  onDone,
  onCancel,
}: {
  initial?: Pick<PartnerQuestion, "kind" | "prompt" | "options">;
  submitLabel: string;
  action: (prev: PartnerActionState, fd: FormData) => Promise<PartnerActionState>;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<QuestionKind>(initial?.kind ?? "text");
  const [formKey, setFormKey] = useState(0);
  const busy = useRef(false);
  const [state, formAction, isPending] = useActionState(async (prev: PartnerActionState, fd: FormData) => {
    try {
      const res = await action(prev, fd);
      if (res.status === "success") {
        setFormKey((k) => k + 1);
        setKind(initial?.kind ?? "text");
        if (res.message) toast.success(res.message);
        onDone?.();
      }
      return res;
    } finally {
      busy.current = false;
    }
  }, idle);
  const id = useId();

  return (
    <form
      key={formKey}
      action={formAction}
      onSubmit={(e) => {
        if (busy.current) {
          e.preventDefault();
          return;
        }
        busy.current = true;
      }}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-prompt`}>Pytanie</Label>
        <Input
          id={`${id}-prompt`}
          name="prompt"
          required
          maxLength={QUESTION_PROMPT_MAX_LENGTH}
          defaultValue={initial?.prompt}
          placeholder="Np. Kiedy planujesz wdrożenie?"
          disabled={isPending}
        />
      </div>
      <fieldset className="flex flex-col gap-2" disabled={isPending}>
        <legend className="mb-2 text-sm font-medium">Rodzaj odpowiedzi</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(QUESTION_KIND_LABELS) as QuestionKind[]).map((k) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-primary" />
              {QUESTION_KIND_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "single_choice" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-options`}>Odpowiedzi do wyboru</Label>
          <Textarea
            id={`${id}-options`}
            name="options"
            rows={4}
            defaultValue={initial?.options.map((o) => o.label).join("\n")}
            placeholder={"W tym kwartale\nW tym roku\nJeszcze nie wiem"}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">Każda w osobnej linii, od 2 do {QUESTION_OPTIONS_MAX}.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Wysyłanie…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" disabled={isPending} onClick={onCancel}>
            Anuluj
          </Button>
        )}
        {state.status === "error" && state.message && <p className="text-sm text-destructive">{state.message}</p>}
      </div>
    </form>
  );
}

function QuestionRow({ partnerId, question, canResubmit }: { partnerId: string; question: PartnerQuestion; canResubmit: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const s = QUESTION_STATUS[question.status];

  if (editing) {
    return (
      <li className="flex flex-col gap-2">
        {question.review_note && (
          <p className="text-xs text-muted-foreground">Uwaga organizatora: {question.review_note}</p>
        )}
        <QuestionForm
          initial={question}
          submitLabel="Wyślij ponownie do akceptacji"
          action={(prev, fd) => resubmitPartnerQuestion(partnerId, question.id, prev, fd)}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{question.prompt}</p>
        <p className="text-xs text-muted-foreground">
          {QUESTION_KIND_LABELS[question.kind]}
          {question.kind === "single_choice" && `: ${question.options.map((o) => o.label).join(" · ")}`}
        </p>
        <Badge variant={s.variant} className="mt-1">{s.label}</Badge>
        {question.status === "rejected" && question.review_note && (
          <p className="mt-1 text-xs text-muted-foreground">Uwaga organizatora: {question.review_note}</p>
        )}
        {question.status === "rejected" && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={!canResubmit}
            title={canResubmit ? undefined : "Limit aktywnych pytań — usuń jedno, aby wysłać to ponownie."}
            onClick={() => setEditing(true)}
          >
            <Pencil /> Popraw i wyślij ponownie
          </Button>
        )}
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={isPending}
        aria-label="Usuń pytanie"
        onClick={() => {
          if (!window.confirm(`Usunąć pytanie „${question.prompt}”?`)) return;
          startTransition(async () => {
            const res = await deletePartnerQuestion(partnerId, question.id);
            if (res.status === "error") toast.error(res.message ?? "Nie udało się usunąć.");
          });
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

// ── Leady ──────────────────────────────────────────────────────────────────

export function PartnerLeadsCard({ partnerId, leadCount, timezone }: { partnerId: string; leadCount: number; timezone: string | null }) {
  const [leads, setLeads] = useState<PartnerLead[] | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kontakty ze stoiska</CardTitle>
        <CardDescription>
          Osoby, które przy stoisku wyraziły zgodę na przekazanie Ci danych. Uczestnik może wycofać zgodę — wtedy
          znika z listy. Każdy podgląd i eksport jest zapisywany w dzienniku, który widzi organizator.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {leadCount} {pluralizePl(leadCount, ["kontakt", "kontakty", "kontaktów"])}
          </Badge>
          {leadCount > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await loadPartnerLeads(partnerId);
                    if (res.status === "error") toast.error(res.message);
                    else setLeads(res.leads);
                  })
                }
              >
                <Eye /> {isPending ? "Wczytywanie…" : leads ? "Odśwież" : "Pokaż kontakty"}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`/partner/${partnerId}/leads.csv`} download>
                  <Download /> Pobierz CSV
                </a>
              </Button>
            </>
          )}
        </div>

        {leads && (
          leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak aktywnych kontaktów.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {leads.map((l) => (
                <li key={l.consentId} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{[l.firstName, l.lastName].filter(Boolean).join(" ") || "Uczestnik"}</p>
                  <p className="break-all text-muted-foreground">
                    {[l.email, l.jobTitle, l.company].filter(Boolean).join(" · ")}
                  </p>
                  {l.answers.length > 0 && (
                    <dl className="mt-2 flex flex-col gap-1">
                      {l.answers.map((a) => (
                        <div key={a.prompt}>
                          <dt className="text-xs text-muted-foreground">{a.prompt}</dt>
                          <dd className="break-words">{a.answer}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Zgoda: {formatDateTime(l.givenAt, timezone)}</p>
                </li>
              ))}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  );
}
