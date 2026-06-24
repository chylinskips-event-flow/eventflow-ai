"use client";

import { useActionState, useEffect, useState } from "react";
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

const QR_HINT_TYPES: MessageTemplateType[] = [
  "registration_confirmed",
  "registration_approved",
];

const QR_SNIPPET = `<img src="cid:qr-code" alt="Kod QR" width="200" height="200" />`;

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

type Props = {
  eventId: string;
  templateType: MessageTemplateType;
  label: string;
  hasSubject: boolean;
  currentSubject: string | null;
  currentBody: string;
  trigger: React.ReactNode;
};

const initialState: TemplateFormState = { status: "idle" };

export function TemplateFormDialog({
  eventId,
  templateType,
  label,
  hasSubject,
  currentSubject,
  currentBody,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "html">("html");
  const [bodyValue, setBodyValue] = useState(currentBody);
  const action = upsertTemplate.bind(null, eventId, templateType);
  const [state, formAction, isPending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
    }
  }, [state]);

  useEffect(() => {
    if (open) {
      setBodyValue(currentBody);
      setActiveTab("html");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isWelcomeTemplate = templateType.startsWith("welcome_");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>Edytuj szablon — {label}</DialogTitle>
        </DialogHeader>

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
                defaultValue={currentSubject ?? ""}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">
                {hasSubject ? "Treść HTML maila" : "Treść wiadomości"}
              </Label>
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
                id="body"
                name="body"
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
                className="min-h-[280px] font-mono text-sm"
                required
              />
            )}
          </div>

          {QR_HINT_TYPES.includes(templateType) && (
            <aside className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
              Aby wyświetlić kod QR w mailu, użyj:
              <code className="mt-1 block select-all font-mono text-xs text-foreground">
                {QR_SNIPPET}
              </code>
            </aside>
          )}

          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
