"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_NAME_MAX_LENGTH,
  CATALOG_UNIT_MAX_LENGTH,
  ITEM_QTY_MAX,
  MAX_WINDOWS,
  SLOT_STEPS,
  TIER_KEYS,
  type CatalogItem,
  type SlotStep,
  type TimeWindow,
} from "@/lib/booth-requests-core";
import { partnerTierLabel } from "@/lib/partner-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCatalogItem, saveCatalogItem, saveLogisticsSettings, type LogisticsState } from "./actions";

const idle: LogisticsState = { status: "idle" };

// ── Ustawienia ─────────────────────────────────────────────────────────────

/** Ustawienia do formularza: termin jako pole datetime-local w strefie eventu (przeliczony na serwerze). */
export type SettingsView = {
  request_deadline: string;
  setup_windows: TimeWindow[];
  teardown_windows: TimeWindow[];
  slot_step_minutes: SlotStep;
  require_vehicle_plate: boolean;
};

export function LogisticsSettingsCard({ eventId, settings }: { eventId: string; settings: SettingsView }) {
  const [deadline, setDeadline] = useState(settings.request_deadline);
  const [step, setStep] = useState(String(settings.slot_step_minutes));
  const [requirePlate, setRequirePlate] = useState(settings.require_vehicle_plate);
  const [state, formAction, isPending] = useActionState(async (prev: LogisticsState, fd: FormData) => {
    const res = await saveLogisticsSettings(eventId, prev, fd);
    if (res.status === "success" && res.message) toast.success(res.message);
    return res;
  }, idle);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Termin, godziny i rozładunek</CardTitle>
        <CardDescription>
          Po terminie partner widzi wniosek tylko do odczytu i może jedynie poprosić o zmianę. Okna montażu
          i demontażu to dni i godziny, w których partner wybiera swój przedział (z listy, co ustawiony krok).
          Bez okna partner podaje tylko orientacyjne godziny. Godziny w strefie wydarzenia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <fieldset disabled={isPending} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="request_deadline">Termin składania wniosków</Label>
              <div className="flex items-center gap-1">
                <DateTimePicker id="request_deadline" name="request_deadline" value={deadline} onChange={setDeadline} />
                {deadline && (
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Wyczyść termin" onClick={() => setDeadline("")}>
                    <X />
                  </Button>
                )}
              </div>
            </div>

            <WindowsEditor prefix="setup" label="Okna montażu" initial={settings.setup_windows} />
            <WindowsEditor prefix="teardown" label="Okna demontażu" initial={settings.teardown_windows} />

            <div className="flex flex-col gap-2 sm:max-w-56">
              <Label htmlFor="slot_step_minutes">Krok wyboru godzin</Label>
              <input type="hidden" name="slot_step_minutes" value={step} />
              <Select value={step} onValueChange={setStep}>
                <SelectTrigger id="slot_step_minutes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_STEPS.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      co {s} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="require_vehicle_plate"
                name="require_vehicle_plate"
                checked={requirePlate}
                onCheckedChange={(v) => setRequirePlate(v === true)}
              />
              <Label htmlFor="require_vehicle_plate" className="font-normal leading-snug">
                Wymagaj numeru rejestracyjnego przy rozładunku
                <span className="block text-xs text-muted-foreground">
                  Numer widzisz tylko Ty i dany partner (lista stoisk, CSV, wydruk dla ochrony).
                </span>
              </Label>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Zapisywanie…" : "Zapisz"}
            </Button>
            {state.status === "error" && state.message && <p className="text-sm text-destructive">{state.message}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type WindowRow = TimeWindow & { key: number };

function WindowsEditor({ prefix, label, initial }: { prefix: "setup" | "teardown"; label: string; initial: TimeWindow[] }) {
  const [rows, setRows] = useState<WindowRow[]>(() => initial.map((w, i) => ({ ...w, key: i })));
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (key: number, patch: Partial<TimeWindow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">Brak okna — partner poda orientacyjne godziny.</p>}
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefix}-date-${r.key}`} className="text-xs text-muted-foreground">Dzień</Label>
            <Input
              id={`${prefix}-date-${r.key}`}
              name={`${prefix}_date`}
              type="date"
              value={r.date}
              onChange={(e) => update(r.key, { date: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefix}-from-${r.key}`} className="text-xs text-muted-foreground">Od</Label>
            <Input
              id={`${prefix}-from-${r.key}`}
              name={`${prefix}_from`}
              type="time"
              step={900}
              value={r.from}
              onChange={(e) => update(r.key, { from: e.target.value })}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefix}-to-${r.key}`} className="text-xs text-muted-foreground">Do</Label>
            <Input
              id={`${prefix}-to-${r.key}`}
              name={`${prefix}_to`}
              type="time"
              step={900}
              value={r.to}
              onChange={(e) => update(r.key, { to: e.target.value })}
              className="w-28"
            />
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Usuń okno"
            onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {rows.length < MAX_WINDOWS && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => {
            const last = rows[rows.length - 1];
            setRows((prev) => [...prev, { date: last?.date ?? "", from: last?.from ?? "", to: last?.to ?? "", key: nextKey }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus /> Dodaj okno
        </Button>
      )}
    </div>
  );
}

// ── Katalog ────────────────────────────────────────────────────────────────

export function CatalogCard({ eventId, catalog }: { eventId: string; catalog: CatalogItem[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Katalog pozycji</CardTitle>
        <CardDescription>
          Pozycje, które partner może zamówić na stoisko. Limit w pakiecie to liczba sztuk wliczona dla danego
          poziomu — powyżej limitu wniosek jest możliwy, ale oznaczony „ponad pakiet”. Puste pole = bez limitu.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {catalog.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {catalog.map((c) => (
              <CatalogRow key={c.id} eventId={eventId} item={c} />
            ))}
          </ul>
        )}
        {adding ? (
          <CatalogForm eventId={eventId} item={null} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setAdding(true)}>
            <Plus /> Dodaj pozycję
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogRow({ eventId, item }: { eventId: string; item: CatalogItem }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const limits = TIER_KEYS.filter((t) => item.included_by_tier[t] !== undefined);

  if (editing) {
    return (
      <li className="p-3">
        <CatalogForm eventId={eventId} item={item} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {item.name} <span className="font-normal text-muted-foreground">({item.unit})</span>
          {!item.active && (
            <Badge variant="secondary" className="ml-2">
              Wyłączona
            </Badge>
          )}
        </p>
        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
        {limits.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            W pakiecie: {limits.map((t) => `${partnerTierLabel(t)} ${item.included_by_tier[t]}`).join(" · ")}
          </p>
        )}
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={`Edytuj: ${item.name}`} onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={isPending}
        aria-label={`Usuń: ${item.name}`}
        onClick={() => {
          if (!window.confirm(`Usunąć pozycję „${item.name}”?`)) return;
          startTransition(async () => {
            const res = await deleteCatalogItem(eventId, item.id);
            if (res.status === "error") toast.error(res.message ?? "Nie udało się usunąć.");
            else if (res.message) toast.success(res.message);
          });
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function CatalogForm({ eventId, item, onDone }: { eventId: string; item: CatalogItem | null; onDone: () => void }) {
  const [active, setActive] = useState(item?.active ?? true);
  const [state, formAction, isPending] = useActionState(async (prev: LogisticsState, fd: FormData) => {
    const res = await saveCatalogItem(eventId, item?.id ?? null, prev, fd);
    if (res.status === "success") {
      if (res.message) toast.success(res.message);
      onDone();
    }
    return res;
  }, idle);
  const id = item?.id ?? "new";

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <fieldset disabled={isPending} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${id}`}>Nazwa</Label>
            <Input id={`name-${id}`} name="name" required maxLength={CATALOG_NAME_MAX_LENGTH} defaultValue={item?.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`unit-${id}`}>Jednostka</Label>
            <Input id={`unit-${id}`} name="unit" maxLength={CATALOG_UNIT_MAX_LENGTH} defaultValue={item?.unit ?? "szt."} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`description-${id}`}>Opis (opcjonalnie)</Label>
          <Input
            id={`description-${id}`}
            name="description"
            maxLength={CATALOG_DESCRIPTION_MAX_LENGTH}
            defaultValue={item?.description ?? ""}
            placeholder="Np. 120 × 60 cm, z obrusem"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Limit w pakiecie (szt.)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIER_KEYS.map((t) => (
              <div key={t} className="flex flex-col gap-1">
                <Label htmlFor={`included_${t}-${id}`} className="text-xs text-muted-foreground">
                  {partnerTierLabel(t)}
                </Label>
                <Input
                  id={`included_${t}-${id}`}
                  name={`included_${t}`}
                  type="number"
                  min={0}
                  max={ITEM_QTY_MAX}
                  defaultValue={item?.included_by_tier[t] ?? ""}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="hidden" name="active" value={active ? "true" : "false"} />
          <Checkbox id={`active-${id}`} checked={active} onCheckedChange={(v) => setActive(v === true)} />
          <Label htmlFor={`active-${id}`} className="font-normal">
            Aktywna (widoczna dla partnerów)
          </Label>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Zapisywanie…" : item ? "Zapisz" : "Dodaj"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={onDone}>
          Anuluj
        </Button>
        {state.status === "error" && state.message && <p className="text-sm text-destructive">{state.message}</p>}
      </div>
    </form>
  );
}
