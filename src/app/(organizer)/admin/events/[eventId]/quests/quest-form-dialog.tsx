"use client";

import { useActionState, useState } from "react";
import { createQuest, updateQuest, type QuestFormState } from "./actions";
import type { Partner } from "@/lib/partners";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export type QuestForEdit = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  points_value: number | null;
  partner_id: string | null;
  target_value: number | null;
  is_active: boolean;
  config: {
    question?: string;
    options?: { id: string; label: string }[];
    correct_id?: string;
    password?: string;
  } | null;
};

const QUEST_TYPES = [
  { value: "booth_visit",          label: "Odwiedziny stoiska (skan QR)" },
  { value: "booth_quiz",           label: "Quiz przy stoisku" },
  { value: "booth_password",       label: "Hasło przy stoisku" },
  { value: "networking_contacts",  label: "Nawiązywanie kontaktów" },
  { value: "profile_complete",     label: "Uzupełnienie profilu" },
];

const BOOTH_TYPES = new Set(["booth_visit", "booth_quiz", "booth_password"]);

const NO_PARTNER = "__none__";
const initialState: QuestFormState = { status: "idle" };

// ---------------------------------------------------------------------------
// Outer — zarządza open/epoch
// ---------------------------------------------------------------------------
export function QuestFormDialog({
  eventId,
  quest,
  partners,
  trigger,
}: {
  eventId: string;
  quest?: QuestForEdit;
  partners: Partner[];
  trigger: React.ReactNode;
}) {
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
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>{quest ? "Edytuj quest" : "Dodaj quest"}</DialogTitle>
        </DialogHeader>
        <QuestFormContent
          key={epoch}
          eventId={eventId}
          quest={quest}
          partners={partners}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inner — stan z propsów przy mount
// ---------------------------------------------------------------------------
function QuestFormContent({
  eventId,
  quest,
  partners,
  onClose,
}: {
  eventId: string;
  quest?: QuestForEdit;
  partners: Partner[];
  onClose: () => void;
}) {
  const action = quest
    ? updateQuest.bind(null, eventId, quest.id)
    : createQuest.bind(null, eventId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  if (state.status === "success") {
    onClose();
    return null;
  }

  const [type, setType] = useState(quest?.type ?? "booth_visit");
  const [partnerId, setPartnerId] = useState(quest?.partner_id ?? NO_PARTNER);

  // Opcje quizu — lista {id, label}
  const [options, setOptions] = useState<{ id: string; label: string }[]>(
    quest?.config?.options ?? [
      { id: crypto.randomUUID(), label: "" },
      { id: crypto.randomUUID(), label: "" },
    ],
  );
  const [correctId, setCorrectId] = useState(quest?.config?.correct_id ?? "");

  function addOption() {
    setOptions((prev) => [...prev, { id: crypto.randomUUID(), label: "" }]);
  }

  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
    if (correctId === id) setCorrectId("");
  }

  function updateOptionLabel(id: string, label: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));
  }

  const isBooth = BOOTH_TYPES.has(type);
  const isQuiz = type === "booth_quiz";
  const isPassword = type === "booth_password";
  const isNetworking = type === "networking_contacts";

  return (
    <form
      action={formAction}
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6"
    >
      {/* Typ */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="type">Typ questa</Label>
        <input type="hidden" name="type" value={type} />
        <Select value={type} onValueChange={setType} disabled={!!quest}>
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUEST_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!!quest && (
          <p className="text-xs text-muted-foreground">
            Typ questa nie może być zmieniony po utworzeniu.
          </p>
        )}
      </div>

      {/* Tytuł */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Tytuł</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={quest?.title ?? ""}
          placeholder="np. Odwiedź stoisko partnera"
        />
      </div>

      {/* Opis */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Opis (opcjonalnie)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={quest?.description ?? ""}
          className="min-h-[72px] text-sm"
        />
      </div>

      {/* Punkty */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="points_value">Punkty</Label>
        <Input
          id="points_value"
          name="points_value"
          type="number"
          min={0}
          defaultValue={quest?.points_value ?? 10}
        />
      </div>

      {/* Partner — tylko typy stoiskowe */}
      {isBooth && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="partner_id">Partner (opcjonalnie)</Label>
          <input
            type="hidden"
            name="partner_id"
            value={partnerId === NO_PARTNER ? "" : partnerId}
          />
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger id="partner_id">
              <SelectValue placeholder="Nie przypisano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARTNER}>Nie przypisano</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Target — tylko networking_contacts */}
      {isNetworking && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="target_value">Cel: liczba kontaktów (min. 1)</Label>
          <Input
            id="target_value"
            name="target_value"
            type="number"
            min={1}
            required
            defaultValue={quest?.target_value ?? 3}
          />
        </div>
      )}

      {/* Quiz */}
      {isQuiz && (
        <div className="flex flex-col gap-3">
          <aside className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
            Pytanie powinno dotyczyć rozmowy przy stoisku (np. specjalizacja firmy,
            imię rozmówcy) — nie faktów dostępnych online.
          </aside>

          <div className="flex flex-col gap-2">
            <Label htmlFor="config_question">Pytanie</Label>
            <Input
              id="config_question"
              name="config_question"
              required
              defaultValue={quest?.config?.question ?? ""}
              placeholder="O czym rozmawiałeś/-aś przy stoisku?"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Opcje odpowiedzi</Label>
            {options.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                {/* Hidden fields for submit */}
                <input type="hidden" name="config_option_id" value={opt.id} />
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="config_correct_id_ui"
                    value={opt.id}
                    checked={correctId === opt.id}
                    onChange={() => setCorrectId(opt.id)}
                    className="accent-primary"
                    required={idx === 0}
                    title="Poprawna odpowiedź"
                  />
                </label>
                <Input
                  name="config_option_label"
                  value={opt.label}
                  onChange={(e) => updateOptionLabel(opt.id, e.target.value)}
                  placeholder={`Opcja ${idx + 1}`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={options.length <= 2}
                  onClick={() => removeOption(opt.id)}
                  className="shrink-0"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {/* Hidden field carries the selected correct_id to the server */}
            <input type="hidden" name="config_correct_id" value={correctId} />
            {options.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                className="self-start"
              >
                <Plus className="size-4" />
                Dodaj opcję
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Zaznacz radio obok poprawnej odpowiedzi. Min. 2, maks. 6 opcji.
            </p>
          </div>
        </div>
      )}

      {/* Hasło */}
      {isPassword && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="config_password">Hasło</Label>
          <Input
            id="config_password"
            name="config_password"
            required
            defaultValue={quest?.config?.password ?? ""}
            placeholder="np. EventFlow2026"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Uczestnik musi podać to hasło przy stoisku partnera.
          </p>
        </div>
      )}

      {/* is_active — tylko edycja */}
      {quest && (
        <input
          type="hidden"
          name="is_active"
          value={quest.is_active ? "true" : "false"}
        />
      )}

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Anuluj
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Zapisywanie..." : quest ? "Zapisz zmiany" : "Dodaj quest"}
        </Button>
      </div>
    </form>
  );
}
