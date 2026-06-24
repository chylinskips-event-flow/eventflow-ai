"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { upsertTemplate, type TemplateFormState } from "./actions";
import type { MessageTemplateType } from "@/lib/message-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const QR_SNIPPET = `<img src="cid:qr-code" alt="Kod QR" width="200" height="200" />`;

const HAS_QR_TYPES: MessageTemplateType[] = [
  "registration_confirmed",
  "registration_approved",
];

const VARIABLES = [
  { label: "{imię}", value: "{imię}" },
  { label: "{nazwa_eventu}", value: "{nazwa_eventu}" },
  { label: "{link_dostępu}", value: "{link_dostępu}" },
];

const SAMPLE_VARS: Record<string, string> = {
  imię: "Jan Kowalski",
  nazwa_eventu: "[Nazwa eventu]",
  "link_dostępu": "#",
};

function applyPreviewVars(body: string): string {
  return Object.entries(SAMPLE_VARS).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`\\{${key}\\}`, "g"), () => value),
    body,
  );
}

export type TemplateFormDialogProps = {
  eventId: string;
  templateType: MessageTemplateType;
  label: string;
  hasSubject: boolean;
  currentSubject: string | null;
  currentBody: string;
  currentBodyMode: "structured" | "html";
  currentBodyHeading: string | null;
  currentBodyMain: string | null;
  currentBodyFooter: string | null;
  trigger: React.ReactNode;
};

const initialState: TemplateFormState = { status: "idle" };

// Outer component: owns open/close state and forces inner remount on each open.
export function TemplateFormDialog(props: TemplateFormDialogProps) {
  const { label, trigger } = props;
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setEpoch((e) => e + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>Edytuj szablon — {label}</DialogTitle>
        </DialogHeader>
        <TemplateFormContent
          key={epoch}
          {...props}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// Inner component: state initialized from props at mount — no reset effect needed.
function TemplateFormContent({
  eventId,
  templateType,
  hasSubject,
  currentSubject,
  currentBody,
  currentBodyMode,
  currentBodyHeading,
  currentBodyMain,
  currentBodyFooter,
  onClose,
}: Omit<TemplateFormDialogProps, "label" | "trigger"> & {
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"structured" | "html">(currentBodyMode);
  const [subjectValue, setSubjectValue] = useState(currentSubject ?? "");
  const [headingValue, setHeadingValue] = useState(currentBodyHeading ?? "");
  const [mainValue, setMainValue] = useState(currentBodyMain ?? "");
  const [footerValue, setFooterValue] = useState(currentBodyFooter ?? "");
  const [bodyValue, setBodyValue] = useState(currentBody);
  const [activeTab, setActiveTab] = useState<"preview" | "html">("preview");
  const [activeField, setActiveField] = useState<
    "heading" | "main" | "footer" | null
  >(null);

  const headingRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLInputElement>(null);

  const action = upsertTemplate.bind(null, eventId, templateType);
  const [state, formAction, isPending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  const isWelcomeTemplate = templateType.startsWith("welcome_");
  const hasFooter = HAS_QR_TYPES.includes(templateType);

  function insertVariable(variable: string) {
    if (activeField === "heading" && headingRef.current) {
      const el = headingRef.current;
      const start = el.selectionStart ?? headingValue.length;
      const end = el.selectionEnd ?? start;
      const next =
        headingValue.slice(0, start) + variable + headingValue.slice(end);
      setHeadingValue(next);
      requestAnimationFrame(() => {
        el.setSelectionRange(
          start + variable.length,
          start + variable.length,
        );
        el.focus();
      });
    } else if (activeField === "main" && mainRef.current) {
      const el = mainRef.current;
      const start = el.selectionStart ?? mainValue.length;
      const end = el.selectionEnd ?? start;
      const next = mainValue.slice(0, start) + variable + mainValue.slice(end);
      setMainValue(next);
      requestAnimationFrame(() => {
        el.setSelectionRange(
          start + variable.length,
          start + variable.length,
        );
        el.focus();
      });
    } else if (activeField === "footer" && footerRef.current) {
      const el = footerRef.current;
      const start = el.selectionStart ?? footerValue.length;
      const end = el.selectionEnd ?? start;
      const next =
        footerValue.slice(0, start) + variable + footerValue.slice(end);
      setFooterValue(next);
      requestAnimationFrame(() => {
        el.setSelectionRange(
          start + variable.length,
          start + variable.length,
        );
        el.focus();
      });
    }
  }

  return (
    <form
      action={formAction}
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6"
    >
      {hasSubject && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="subject">Temat maila</Label>
          <Input
            id="subject"
            name="subject"
            value={subjectValue}
            onChange={(e) => setSubjectValue(e.target.value)}
          />
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "structured" ? "default" : "outline"}
          onClick={() => setMode("structured")}
        >
          Edytor
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "html" ? "default" : "outline"}
          onClick={() => setMode("html")}
        >
          Zaawansowane (HTML)
        </Button>
      </div>
      <input type="hidden" name="body_mode" value={mode} />

      {mode === "structured" ? (
        <>
          {!isWelcomeTemplate && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="body_heading">Nagłówek</Label>
              <Input
                ref={headingRef}
                id="body_heading"
                name="body_heading"
                placeholder="Witaj, {imię}!"
                value={headingValue}
                onChange={(e) => setHeadingValue(e.target.value)}
                onFocus={() => setActiveField("heading")}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="body_main">
              {isWelcomeTemplate ? "Treść wiadomości" : "Tekst główny"}
            </Label>
            <Textarea
              ref={mainRef}
              id="body_main"
              name="body_main"
              placeholder={
                isWelcomeTemplate
                  ? "{imię}, cieszymy się, że będziesz z nami."
                  : "Twoja rejestracja na {nazwa_eventu} została potwierdzona."
              }
              value={mainValue}
              onChange={(e) => setMainValue(e.target.value)}
              onFocus={() => setActiveField("main")}
              className="min-h-[120px] text-sm"
              required
            />
            {!isWelcomeTemplate && (
              <p className="text-xs text-muted-foreground">
                Pusty wiersz (Enter dwa razy) tworzy nowy akapit.
              </p>
            )}
          </div>

          {hasFooter && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="body_footer">Tekst pod kodem QR</Label>
              <Input
                ref={footerRef}
                id="body_footer"
                name="body_footer"
                placeholder="Pokaż ten kod przy wejściu na wydarzenie."
                value={footerValue}
                onChange={(e) => setFooterValue(e.target.value)}
                onFocus={() => setActiveField("footer")}
              />
            </div>
          )}

          {/* Variable chips */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              Zmienne — kliknij aby wstawić w aktywne pole:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  disabled={!activeField}
                  onClick={() => insertVariable(v.value)}
                  className="rounded border bg-muted px-2 py-0.5 font-mono text-xs transition-opacity disabled:opacity-40 enabled:hover:bg-accent"
                >
                  {v.label}
                </button>
              ))}
            </div>
            {!activeField && (
              <p className="text-xs text-muted-foreground/70">
                Kliknij pole tekstowe, aby aktywować wstawianie.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body_html">Treść HTML</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={activeTab === "html" ? "default" : "outline"}
                onClick={() => setActiveTab("html")}
              >
                HTML
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === "preview" ? "default" : "outline"}
                onClick={() => setActiveTab("preview")}
              >
                Podgląd
              </Button>
            </div>
          </div>

          {/* Always carries bodyValue in HTML mode — works in both HTML and preview tabs */}
          <input type="hidden" name="body" value={bodyValue} />

          {activeTab === "preview" ? (
            <div className="min-h-[200px] overflow-y-auto rounded-md border p-3 text-sm">
              {isWelcomeTemplate ? (
                <p>{applyPreviewVars(bodyValue)}</p>
              ) : (
                <div
                  dangerouslySetInnerHTML={{
                    __html: applyPreviewVars(bodyValue),
                  }}
                />
              )}
            </div>
          ) : (
            <Textarea
              id="body_html"
              value={bodyValue}
              onChange={(e) => setBodyValue(e.target.value)}
              className="min-h-[280px] font-mono text-sm"
            />
          )}

          {HAS_QR_TYPES.includes(templateType) && (
            <aside className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
              Aby wyświetlić kod QR w mailu, użyj:
              <code className="mt-1 block select-all font-mono text-xs text-foreground">
                {QR_SNIPPET}
              </code>
            </aside>
          )}
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Anuluj
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Zapisywanie..." : "Zapisz"}
        </Button>
      </div>
    </form>
  );
}
