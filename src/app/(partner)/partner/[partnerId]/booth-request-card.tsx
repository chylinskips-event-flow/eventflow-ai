"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Lock, Truck, X } from "lucide-react";
import {
  CREW_MAX,
  ITEM_NOTE_MAX_LENGTH,
  ITEM_QTY_MAX,
  ITEM_STATUS,
  OTHER_NEEDS_MAX_LENGTH,
  VEHICLE_NOTE_MAX_LENGTH,
  isOverPackage,
  requestStatus,
  requestStatusLabel,
  type RequestItem,
} from "@/lib/booth-requests-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** Daty już sformatowane / przeliczone na pola datetime-local w strefie eventu (po stronie serwera). */
export type BoothRequestView = {
  items: RequestItem[];
  crew_count: number | null;
  setup_start: string;
  setup_end: string;
  teardown_start: string;
  teardown_end: string;
  vehicle: boolean;
  vehicle_note: string | null;
  submittedAt: string | null;
  lateChange: boolean;
};

export function BoothRequestCard({
  partnerId,
  catalog,
  request,
  deadlineLabel,
  locked,
  setupRange,
  teardownRange,
}: {
  partnerId: string;
  catalog: BoothCatalogView[];
  request: BoothRequestView | null;
  deadlineLabel: string | null;
  /** Po terminie składania — formularz tylko do odczytu, zmiany przez „Poproś o zmianę”. */
  locked: boolean;
  setupRange: string | null;
  teardownRange: string | null;
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
              <TimeRange
                label="Montaż"
                hint={setupRange}
                names={["setup_start", "setup_end"]}
                initial={[request?.setup_start ?? "", request?.setup_end ?? ""]}
              />
              <TimeRange
                label="Demontaż"
                hint={teardownRange}
                names={["teardown_start", "teardown_end"]}
                initial={[request?.teardown_start ?? "", request?.teardown_end ?? ""]}
              />
              <VehicleField initial={request?.vehicle ?? false} note={request?.vehicle_note ?? ""} />
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
  const s = ITEM_STATUS[item.status];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant={s.variant}>{s.label}</Badge>
      {item.status === "changed" && (
        <span>
          Zatwierdzono: {item.approved_qty ?? 0} {item.unit} (zgłoszono {item.qty})
        </span>
      )}
      {item.decision_note && <span className="text-muted-foreground">Uwaga organizatora: {item.decision_note}</span>}
    </div>
  );
}

function TimeField({ id, name, initial }: { id: string; name: string; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex items-center gap-1">
      <DateTimePicker id={id} name={name} value={value} onChange={setValue} />
      {value && (
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Wyczyść" onClick={() => setValue("")}>
          <X />
        </Button>
      )}
    </div>
  );
}

function TimeRange({
  label,
  hint,
  names,
  initial,
}: {
  label: string;
  hint: string | null;
  names: [string, string];
  initial: [string, string];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">Możliwy w godzinach: {hint}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={names[0]} className="text-xs text-muted-foreground">Od</Label>
          <TimeField id={names[0]} name={names[0]} initial={initial[0]} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={names[1]} className="text-xs text-muted-foreground">Do</Label>
          <TimeField id={names[1]} name={names[1]} initial={initial[1]} />
        </div>
      </div>
    </div>
  );
}

function VehicleField({ initial, note }: { initial: boolean; note: string }) {
  const [vehicle, setVehicle] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox id="vehicle" name="vehicle" checked={vehicle} onCheckedChange={(v) => setVehicle(v === true)} />
        <Label htmlFor="vehicle" className="flex items-center gap-1.5 font-normal">
          <Truck className="size-4 text-muted-foreground" /> Przyjedziemy pojazdem / potrzebny rozładunek
        </Label>
      </div>
      {vehicle && (
        <Input
          name="vehicle_note"
          maxLength={VEHICLE_NOTE_MAX_LENGTH}
          defaultValue={note}
          placeholder="Np. bus 3,5 t, rozładunek ok. 30 min, potrzebny wózek"
          aria-label="Uwaga o rozładunku"
        />
      )}
    </div>
  );
}
