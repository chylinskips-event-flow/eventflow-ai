import { redirect } from "next/navigation";
import { getOwnEvent } from "@/lib/events";
import {
  DEFAULT_TEMPLATES,
  type MessageTemplateType,
} from "@/lib/message-templates";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TemplateFormDialog } from "./template-form-dialog";
import { DeleteTemplateButton } from "./delete-template-button";

type TemplateRow = {
  subject: string | null;
  body: string;
};

const TEMPLATE_META: {
  type: MessageTemplateType;
  label: string;
  channel: "Email" | "UI";
}[] = [
  { type: "registration_confirmed", label: "Potwierdzenie rejestracji", channel: "Email" },
  { type: "registration_pending",   label: "Zgłoszenie — oczekiwanie",  channel: "Email" },
  { type: "registration_approved",  label: "Zatwierdzenie rejestracji", channel: "Email" },
  { type: "registration_rejected",  label: "Odrzucenie rejestracji",    channel: "Email" },
  { type: "welcome_approved",       label: "Strona potwierdzenia",      channel: "UI"    },
  { type: "welcome_pending",        label: "Strona oczekiwania",        channel: "UI"    },
];

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getOwnEvent(eventId);
  if (!event) redirect("/admin");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("event_message_templates")
    .select("template_type, subject, body")
    .eq("event_id", eventId);

  const customMap = new Map<string, TemplateRow>(
    (rows ?? []).map((r) => [r.template_type, { subject: r.subject, body: r.body }]),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Szablony komunikatów</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edytuj treść maili i komunikatów UI wysyłanych do uczestników.
          Szablony bez własnej konfiguracji używają treści domyślnych.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {TEMPLATE_META.map(({ type, label, channel }) => {
          const custom = customMap.get(type);
          const isCustom = !!custom;
          const current = custom ?? DEFAULT_TEMPLATES[type];

          return (
            <Card key={type}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{label}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {channel}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        isCustom
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isCustom ? "Własny" : "Domyślny"}
                    </span>
                  </div>
                  {current.subject && (
                    <span className="truncate text-sm text-muted-foreground">
                      Temat: {current.subject}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isCustom && (
                    <DeleteTemplateButton
                      eventId={eventId}
                      templateType={type}
                    />
                  )}
                  <TemplateFormDialog
                    eventId={eventId}
                    templateType={type}
                    label={label}
                    hasSubject={channel === "Email"}
                    currentSubject={current.subject}
                    currentBody={current.body}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edytuj
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
