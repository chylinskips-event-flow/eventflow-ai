"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Lock, Truck } from "lucide-react";
import {
  CREW_MAX,
  ITEM_NOTE_MAX_LENGTH,
  ITEM_QTY_MAX,
  ITEM_STATUS,
  OTHER_NEEDS_MAX_LENGTH,
  PLATE_MAX_LENGTH,
  TIME_NOTE_MAX_LENGTH,
  VEHICLE_NOTE_MAX_LENGTH,
  VEHICLE_TYPES,
  effectiveStatus,
  isOverPackage,
  requestStatus,
  requestStatusLabel,
  slotFits,
  slotTimes,
  toMinutes,
  windowLabel,
  type RequestItem,
  type TimeSlot,
  type TimeWindow,
} from "@/lib/booth-requests-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitBoothRequest } from "./booth-actions";
import type { PartnerActionState } from "./actions";

const idle: PartnerActionState = { status: "idle" };

/** Pozycja katalogu w widoku partnera — `included` = sztuk w pakiecie jego poziomu (null = bez limitu). */
export type BoothCatalogView = {
  id: string;
  name: string;
  unit: string;
  description: string | null;
  active: boolean;
  included: number | null;
};

/** Godziny przeliczone na dzień + godziny w strefie eventu (po stronie serwera). */
export type BoothRequestView = {
  items: RequestItem[];
  crew_count: number | null;
  setup: TimeSlot | null;
  teardown: TimeSlot | null;
  setup_note: string | null;
  teardown_note: string | null;
  vehicle: boolean;
  vehicle_note: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  submittedAt: string | null;
  lateChange: boolean;
  timesNeedFix: boolean;
};

export function BoothRequestCard({
  partnerId,
  catalog,
  request,
  deadlineLabel,
  locked,
  setupWindows,
  teardownWindows,
  slotStep,
  requirePlate,
}: {
  partnerId: string;
  catalog: BoothCatalogView[];
  request: BoothRequestView | null;
  deadlineLabel: string | null;
  /** Po terminie składania — formularz tylko do odczytu, zmiany przez „Poproś o zmianę”. */
  locked: boolean;
  setupWindows: TimeWindow[];
  teardownWindows: TimeWindow[];
  slotStep: number;
  requirePlate: boolean;
}) {
  const [changeMode, setChangeMode] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState(async (prev: PartnerActionState, fd: FormData) => {
    const res = await submitBoothRequest(partnerId, prev, fd);
    if (res.status === "success") {
      if (res.message) toast.success(res.message);
      setChangeMode(false);
      setFormKey((k) => k + 1);
    }
    return res;
  }, idle);

  const readOnly = locked && !changeMode;
  const items = request?.items ?? [];
  const byCatalog = new Map(items.filter((i) => i.catalog_item_id).map((i) => [i.catalog_item_id as string, i]));
  const other = items.find((i) => !i.catalog_item_id) ?? null;
  const status = requestStatus(request ? items : null);
  // Pozycje wyłączone przez organizatora, ale już zgłoszone — widoczne tylko do odczytu.
  const visible = catalog.filter((c) => c.active || byCatalog.has(c.id));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Zapotrzebowanie na stoisko</CardTitle>
          <Badge variant={STATUS_VARIANT[status.kind]}>{requestStatusLabel(status)}</Badge>
        </div>
        <CardDescription>
          Wpisz, czego potrzebujesz na stoisku (0 = nie potrzebuję). Organizator zatwierdza każdą pozycję —
          zmiana zatwierdzonej pozycji wraca do ponownej akceptacji, pozostałe zachowują decyzję.
          {deadlineLabel && <> Termin składania: <strong>{deadlineLabel}</strong>.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {request?.timesNeedFix && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              <strong>Do poprawy:</strong> organizator zmienił godziny montażu/demontażu i Twój wybór jest poza nimi.
              Wybierz godziny ponownie i wyślij wniosek.
            </p>
          </div>
        )}
        {locked && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-2">
              <Lock className="size-4 shrink-0 text-muted-foreground" />
              {changeMode
                ? "Termin minął — zmiany trafią do organizatora jako prośba o zmianę."
                : "Termin składania minął — wniosek jest tylko do odczytu."}
            </p>
            {!changeMode && (
              <Button type="button" size="sm" variant="outline" onClick={() => setChangeMode(true)}>
                Poproś o zmianę
              </Button>
            )}
          </div>
        )}

        <form key={formKey} action={formAction} className="flex flex-col gap-6">
          {changeMode && <input type="hidden" name="change_request" value="1" />}
          <fieldset disabled={readOnly || isPending} className="flex flex-col gap-6">
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">Organizator nie przygotował jeszcze listy pozycji.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {visible.map((c) => (
                  <CatalogRow key={c.id} item={c} requested={byCatalog.get(c.id) ?? null} />
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="other_needs">Inne potrzeby</Label>
              <Textarea
                id="other_needs"
                name="other_needs"
                rows={3}
                maxLength={OTHER_NEEDS_MAX_LENGTH}
                defaultValue={other?.note ?? ""}
                placeholder="Np. dostęp do wody, dodatkowy kosz, miejsce na banner podwieszany"
              />
              {other && <Decision item={other} />}
            </div>

            <div className="flex flex-col gap-4 rounded-lg border p-4">
              <p className="text-sm font-medium">Informacje o stoisku</p>
              <div className="flex flex-col gap-2 sm:max-w-48">
                <Label htmlFor="crew_count">Liczba osób obsługi</Label>
                <Input
                  id="crew_count"
                  name="crew_count"
                  type="number"
                  min={0}
                  max={CREW_MAX}
                  defaultValue={request?.crew_count ?? ""}
                />
              </div>
              <SlotPicker
                kind="setup"
                label="Montaż"
                windows={setupWindows}
                step={slotStep}
                initial={request?.setup ?? null}
                initialNote={request?.setup_note ?? ""}
              />
              <SlotPicker
                kind="teardown"
                label="Demontaż"
                windows={teardownWindows}
                step={slotStep}
                initial={request?.teardown ?? null}
                initialNote={request?.teardown_note ?? ""}
              />
              <VehicleField
                initial={request?.vehicle ?? false}
                note={request?.vehicle_note ?? ""}
                plate={request?.vehicle_plate ?? ""}
                type={request?.vehicle_type ?? ""}
                requirePlate={requirePlate}
              />
            </div>
          </fieldset>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Wysyłanie…" : changeMode ? "Wyślij prośbę o zmianę" : "Wyślij do akceptacji"}
              </Button>
              {changeMode && (
                <Button type="button" variant="ghost" disabled={isPending} onClick={() => setChangeMode(false)}>
                  Anuluj
                </Button>
              )}
              {state.status === "error" && state.message && <p className="text-sm text-destructive">{state.message}</p>}
            </div>
          )}
          {request?.submittedAt && (
            <p className="text-xs text-muted-foreground">
              Ostatnio wysłano: {request.submittedAt}
              {request.lateChange ? " (zmiana po terminie)" : ""}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

const STATUS_VARIANT = {
  none: "secondary",
  pending: "warning",
  partial: "indigo",
  approved: "success",
  rejected: "destructive",
} as const;

function CatalogRow({ item, requested }: { item: BoothCatalogView; requested: RequestItem | null }) {
  const [qty, setQty] = useState(requested ? String(requested.qty) : "");
  const n = /^\d+$/.test(qty) ? Number(qty) : 0;
  const over = isOverPackage(n, item.included);

  if (!item.active) {
    return (
      <li className="flex flex-col gap-1 p-3 text-sm">
        <p className="font-medium">
          {item.name} — {requested?.qty} {item.unit}
        </p>
        <p className="text-xs text-muted-foreground">Pozycja wyłączona przez organizatora — zgłoszenie zostaje bez zmian.</p>
        {requested && <Decision item={requested} />}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`qty_${item.id}`} className="font-medium">
            {item.name}
          </Label>
          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.included !== null && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                W pakiecie: {item.included} {item.unit}
              </Badge>
            )}
            {over && <Badge variant="warning">Ponad pakiet — decyzja organizatora</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id={`qty_${item.id}`}
            name={`qty_${item.id}`}
            type="number"
            min={0}
            max={ITEM_QTY_MAX}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">{item.unit}</span>
        </div>
      </div>
      {n > 0 && (
        <Input
          name={`note_${item.id}`}
          maxLength={ITEM_NOTE_MAX_LENGTH}
          defaultValue={requested?.note ?? ""}
          placeholder="Uwaga do pozycji (opcjonalnie)"
          aria-label={`Uwaga: ${item.name}`}
        />
      )}
      {requested && <Decision item={requested} />}
    </li>
  );
}

function Decision({ item }: { item: RequestItem }) {
  const status = effectiveStatus(item);
  const s = ITEM_STATUS[status];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant={s.variant}>{s.label}</Badge>
      {status === "changed" && (
        <span>
          Zatwierdzono: {item.approved_qty ?? 0} {item.unit} (zgłoszono {item.qty})
        </span>
      )}
      {item.decision_note && <span className="text-muted-foreground">Uwaga organizatora: {item.decision_note}</span>}
    </div>
  );
}

const NONE = "__none__";

/**
 * Wybór godzin etapu. Z oknami organizatora: okno (dzień + zakres) i godziny z listy co `step`
 * minut — poza oknem nie da się wybrać. Bez okien: tylko orientacyjny opis.
 */
function SlotPicker({
  kind,
  label,
  windows,
  step,
  initial,
  initialNote,
}: {
  kind: "setup" | "teardown";
  label: string;
  windows: TimeWindow[];
  step: number;
  initial: TimeSlot | null;
  initialNote: string;
}) {
  const startIndex = initial ? windows.findIndex((w) => slotFits(initial, [w], step)) : -1;
  const [windowIndex, setWindowIndex] = useState(startIndex >= 0 ? String(startIndex) : NONE);
  const [from, setFrom] = useState(startIndex >= 0 && initial ? initial.from : NONE);
  const [to, setTo] = useState(startIndex >= 0 && initial ? initial.to : NONE);

  if (windows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${kind}_note`}>{label} — orientacyjnie</Label>
        <Input
          id={`${kind}_note`}
          name={`${kind}_note`}
          maxLength={TIME_NOTE_MAX_LENGTH}
          defaultValue={initialNote}
          placeholder="Np. dzień przed wydarzeniem, ok. 16:00–18:00"
        />
        <p className="text-xs text-muted-foreground">Organizator nie ustawił zakresu — podaj orientacyjne godziny.</p>
      </div>
    );
  }

  const w = windowIndex === NONE ? null : windows[Number(windowIndex)];
  const times = w ? slotTimes(w, step) : [];
  const starts = times.slice(0, -1);
  const ends = from === NONE ? [] : times.filter((t) => toMinutes(t) > toMinutes(from));
  const chosen = w && from !== NONE && to !== NONE;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {initial && startIndex < 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Poprzedni wybór ({windowLabel(initial)}) jest poza godzinami organizatora — wybierz ponownie.
        </p>
      )}
      <input type="hidden" name={`${kind}_date`} value={chosen ? w.date : ""} />
      <input type="hidden" name={`${kind}_from`} value={chosen ? from : ""} />
      <input type="hidden" name={`${kind}_to`} value={chosen ? to : ""} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${kind}-window`} className="text-xs text-muted-foreground">Dzień i zakres</Label>
          <Select
            value={windowIndex}
            onValueChange={(v) => {
              setWindowIndex(v);
              setFrom(NONE);
              setTo(NONE);
            }}
          >
            <SelectTrigger id={`${kind}-window`} className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— nie wybrano —</SelectItem>
              {windows.map((win, i) => (
                <SelectItem key={i} value={String(i)}>
                  {windowLabel(win)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {w && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${kind}-from`} className="text-xs text-muted-foreground">Od</Label>
              <Select
                value={from}
                onValueChange={(v) => {
                  setFrom(v);
                  if (to !== NONE && toMinutes(to) <= toMinutes(v)) setTo(NONE);
                }}
              >
                <SelectTrigger id={`${kind}-from`} className="w-24">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {starts.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${kind}-to`} className="text-xs text-muted-foreground">Do</Label>
              <Select value={to} onValueChange={setTo} disabled={from === NONE}>
                <SelectTrigger id={`${kind}-to`} className="w-24">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {ends.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      {w && (from === NONE) !== (to === NONE) && (
        <p className="text-xs text-muted-foreground">Wybierz godzinę rozpoczęcia i zakończenia.</p>
      )}
    </div>
  );
}

function VehicleField({
  initial,
  note,
  plate,
  type,
  requirePlate,
}: {
  initial: boolean;
  note: string;
  plate: string;
  type: string;
  requirePlate: boolean;
}) {
  const [vehicle, setVehicle] = useState(initial);
  const [vehicleType, setVehicleType] = useState(type || NONE);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox id="vehicle" name="vehicle" checked={vehicle} onCheckedChange={(v) => setVehicle(v === true)} />
        <Label htmlFor="vehicle" className="flex items-center gap-1.5 font-normal">
          <Truck className="size-4 text-muted-foreground" /> Przyjedziemy pojazdem / potrzebny rozładunek
        </Label>
      </div>
      {vehicle && (
        <div className="flex flex-col gap-3 pl-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vehicle_plate" className="text-xs text-muted-foreground">
                Numer rejestracyjny{requirePlate ? " *" : " (opcjonalnie)"}
              </Label>
              <Input
                id="vehicle_plate"
                name="vehicle_plate"
                required={requirePlate}
                maxLength={PLATE_MAX_LENGTH}
                defaultValue={plate}
                placeholder="WX 12345"
                autoComplete="off"
                className="w-40 uppercase"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vehicle_type" className="text-xs text-muted-foreground">Typ pojazdu (opcjonalnie)</Label>
              <input type="hidden" name="vehicle_type" value={vehicleType === NONE ? "" : vehicleType} />
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger id="vehicle_type" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— nie podano —</SelectItem>
                  {VEHICLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input
            name="vehicle_note"
            maxLength={VEHICLE_NOTE_MAX_LENGTH}
            defaultValue={note}
            placeholder="Np. bus 3,5 t, rozładunek ok. 30 min, potrzebny wózek"
            aria-label="Uwaga o rozładunku"
          />
          <p className="text-xs text-muted-foreground">Numer rejestracyjny widzi tylko organizator (np. dla ochrony przy wjeździe).</p>
        </div>
      )}
    </div>
  );
}
