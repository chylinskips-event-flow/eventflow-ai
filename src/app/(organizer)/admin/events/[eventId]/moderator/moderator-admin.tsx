"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2Off, Trash2 } from "lucide-react";
import { ALERT_MAX_LENGTH, MODERATOR_NOTE_MAX_LENGTH } from "@/lib/moderator-core";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createAlert,
  createModeratorLink,
  deleteAlert,
  revokeModeratorLink,
  saveModeratorNote,
  type ModeratorAdminState,
} from "./actions";

const idle: ModeratorAdminState = { status: "idle" };
const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";

type LinkView = { id: string; label: string; room: string | null; revoked: boolean; url: string };
type AlertView = {
  id: string;
  content: string;
  room: string | null;
  is_important: boolean;
  announced_at: string | null;
  announced_by: string | null;
};
type SessionView = { id: string; title: string; meta: string; note: string };

export function ModeratorAdmin({
  eventId,
  rooms,
  links,
  alerts,
  script,
  sessions,
  timezone,
}: {
  eventId: string;
  rooms: string[];
  links: LinkView[];
  alerts: AlertView[];
  script: string;
  sessions: SessionView[];
  timezone: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <LinksSection eventId={eventId} rooms={rooms} links={links} />
      <AlertsSection eventId={eventId} rooms={rooms} alerts={alerts} timezone={timezone} />
      <NotesSection eventId={eventId} script={script} sessions={sessions} />
    </div>
  );
}

function useAdminAction() {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<ModeratorAdminState>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
    });
  return { isPending, run };
}

function RoomSelect({ id, rooms }: { id: string; rooms: string[] }) {
  return (
    <select id={id} name="room" defaultValue="" className={SELECT_CLASS}>
      <option value="">Wszystkie sale</option>
      {rooms.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

function FormMessage({ state }: { state: ModeratorAdminState }) {
  if (!state.message) return null;
  return (
    <p className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
      {state.message}
    </p>
  );
}

// ── Linki ──────────────────────────────────────────────────────────────────

function LinksSection({ eventId, rooms, links }: { eventId: string; rooms: string[]; links: LinkView[] }) {
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: ModeratorAdminState, formData: FormData) => {
      const res = await createModeratorLink(eventId, prev, formData);
      if (res.status === "success") setFormKey((k) => k + 1);
      return res;
    },
    idle,
  );
  const active = links.filter((l) => !l.revoked);
  const revoked = links.filter((l) => l.revoked);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linki dla prowadzących</CardTitle>
        <CardDescription>
          Osobny link dla każdej sali (albo jeden na wszystkie). Kto ma link, ten widzi panel —
          przekaż go tylko prowadzącemu. Link można w każdej chwili unieważnić.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form key={formKey} action={formAction} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="link-label">Prowadzący</Label>
            <Input id="link-label" name="label" required maxLength={100} placeholder="Np. Anna — Sala A" />
          </div>
          <div className="flex flex-col gap-2 sm:w-48">
            <Label htmlFor="link-room">Sala</Label>
            <RoomSelect id="link-room" rooms={rooms} />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Tworzenie…" : "Utwórz link"}
          </Button>
        </form>
        <FormMessage state={state} />

        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak aktywnych linków.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((l) => (
              <LinkRow key={l.id} eventId={eventId} link={l} />
            ))}
          </ul>
        )}
        {revoked.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Unieważnione ({revoked.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
              {revoked.map((l) => (
                <li key={l.id} className="line-through">
                  {l.label} · {l.room ?? "wszystkie sale"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function LinkRow({ eventId, link }: { eventId: string; link: LinkView }) {
  const { isPending, run } = useAdminAction();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nie udało się skopiować — zaznacz link ręcznie.");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{link.label}</span>
        <Badge variant="secondary">{link.room ?? "Wszystkie sale"}</Badge>
      </div>
      <code className="break-all rounded bg-muted px-2 py-1 text-xs">{link.url}</code>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Skopiowano" : "Kopiuj"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Otwórz
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (window.confirm(`Unieważnić link „${link.label}”? Prowadzący straci dostęp do panelu.`)) {
              run(() => revokeModeratorLink(eventId, link.id));
            }
          }}
        >
          <Link2Off className="size-4" />
          Unieważnij
        </Button>
      </div>
    </li>
  );
}

// ── Komunikaty ─────────────────────────────────────────────────────────────

function AlertsSection({
  eventId,
  rooms,
  alerts,
  timezone,
}: {
  eventId: string;
  rooms: string[];
  alerts: AlertView[];
  timezone: string | null;
}) {
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: ModeratorAdminState, formData: FormData) => {
      const res = await createAlert(eventId, prev, formData);
      if (res.status === "success") setFormKey((k) => k + 1);
      return res;
    },
    idle,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Komunikaty do ogłoszenia</CardTitle>
        <CardDescription>
          Ważne rzeczy do przekazania ze sceny (zmiana sali, przerwa, zguba, konkurs). Pojawiają się
          od razu w panelu prowadzącego; po ogłoszeniu prowadzący je odhacza.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form key={formKey} action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="alert-content">Treść</Label>
            <Textarea
              id="alert-content"
              name="content"
              required
              rows={3}
              maxLength={ALERT_MAX_LENGTH}
              placeholder="Np. Lunch przesunięty na 13:15. Prosimy o zajęcie miejsc przed panelem."
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-2 sm:w-48">
              <Label htmlFor="alert-room">Sala</Label>
              <RoomSelect id="alert-room" rooms={rooms} />
            </div>
            <div className="flex items-center gap-2 sm:pb-2">
              <Checkbox id="alert-important" name="important" />
              <Label htmlFor="alert-important" className="font-normal">
                Ważne (wyróżnione)
              </Label>
            </div>
            <Button type="submit" disabled={isPending} className="sm:ml-auto">
              {isPending ? "Dodawanie…" : "Dodaj komunikat"}
            </Button>
          </div>
          <FormMessage state={state} />
        </form>

        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak komunikatów.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((a) => (
              <AlertRow key={a.id} eventId={eventId} alert={a} timezone={timezone} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({ eventId, alert, timezone }: { eventId: string; alert: AlertView; timezone: string | null }) {
  const { isPending, run } = useAdminAction();
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        alert.is_important && !alert.announced_at && "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
        alert.announced_at && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="whitespace-pre-line break-words text-sm">{alert.content}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary">{alert.room ?? "Wszystkie sale"}</Badge>
          {alert.is_important && <Badge variant="warning">Ważne</Badge>}
          {alert.announced_at ? (
            <Badge variant="success">
              Ogłoszone {formatDateTime(alert.announced_at, timezone)}
              {alert.announced_by ? ` · ${alert.announced_by}` : ""}
            </Badge>
          ) : (
            <span>Czeka na ogłoszenie</span>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        aria-label="Usuń komunikat"
        onClick={() => {
          if (window.confirm("Usunąć komunikat?")) run(() => deleteAlert(eventId, alert.id));
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

// ── Scenariusz i notatki ───────────────────────────────────────────────────

function NotesSection({
  eventId,
  script,
  sessions,
}: {
  eventId: string;
  script: string;
  sessions: SessionView[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenariusz i notatki</CardTitle>
        <CardDescription>
          Widoczne tylko w panelu prowadzącego (nie dla uczestników). Scenariusz dotyczy całego
          wydarzenia, notatki — konkretnych sesji (np. zapowiedź prelegenta, kolejność paneli).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <NoteForm eventId={eventId} sessionId={null} label="Scenariusz wydarzenia" initial={script} rows={8} />
        {sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Notatki do sesji</h3>
            {sessions.map((s) => (
              <details key={s.id} className="rounded-lg border p-3" open={!!s.note}>
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">{s.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{s.meta}</span>
                  {s.note && <Badge variant="indigo" className="ml-2">notatka</Badge>}
                </summary>
                <div className="mt-3">
                  <NoteForm eventId={eventId} sessionId={s.id} label="Notatka dla prowadzącego" initial={s.note} rows={4} />
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoteForm({
  eventId,
  sessionId,
  label,
  initial,
  rows,
}: {
  eventId: string;
  sessionId: string | null;
  label: string;
  initial: string;
  rows: number;
}) {
  const [state, formAction, isPending] = useActionState(
    (prev: ModeratorAdminState, formData: FormData) => saveModeratorNote(eventId, sessionId, prev, formData),
    idle,
  );
  const id = `note-${sessionId ?? "script"}`;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name="content" rows={rows} defaultValue={initial} maxLength={MODERATOR_NOTE_MAX_LENGTH} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Zapisywanie…" : "Zapisz"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
