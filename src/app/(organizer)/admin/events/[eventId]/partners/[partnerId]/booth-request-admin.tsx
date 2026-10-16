"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CheckCheck, PackageCheck, Pencil, Truck, X } from "lucide-react";
import {
  DECISION_NOTE_MAX_LENGTH,
  ITEM_STATUS,
  approvedQty,
  effectiveStatus,
  OTHER_NEEDS_LABEL,
  requestStatus,
  requestStatusLabel,
  type RequestItem,
} from "@/lib/booth-requests-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  approveBoothItemsInPackage,
  decideBoothItem,
  type BoothDecision,
  type BoothDecisionState,
} from "./booth-actions";

const idle: BoothDecisionState = { status: "idle" };

export type AdminRequestItem = RequestItem & { included: number | null; over: boolean };

export type AdminBoothRequestView = {
  items: AdminRequestItem[];
  crewCount: number | null;
  setup: string | null;
  teardown: string | null;
  vehicle: boolean;
  vehicleLabel: string;
  timesNeedFix: boolean;
  submittedAt: string | null;
  lateChange: boolean;
};

const STATUS_VARIANT = {
  none: "secondary",
  pending: "warning",
  partial: "indigo",
  approved: "success",
  rejected: "destructive",
} as const;

export function BoothRequestAdmin({
  eventId,
  partnerId,
  request,
  inPackageCount,
}: {
  eventId: string;
  partnerId: string;
  request: AdminBoothRequestView | null;
  inPackageCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const status = requestStatus(request?.items ?? null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Zapotrzebowanie na stoisko</CardTitle>
          <Badge variant={STATUS_VARIANT[status.kind]}>{requestStatusLabel(status)}</Badge>
        </div>
        <CardDescription>
          Zatwierdź, zmień ilość albo odrzuć każdą pozycję. Gdy nic nie zostanie do akceptacji, partner dostanie
          e-mail z decyzjami. Katalog, limity w pakiecie i terminy:{" "}
          <Link href={`/admin/events/${eventId}/partners/logistics`} className="font-medium text-primary hover:underline">
            Logistyka stoisk
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!request ? (
          <p className="text-sm text-muted-foreground">Partner nie złożył jeszcze wniosku.</p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
              <Info label="Osoby obsługi" value={request.crewCount !== null ? String(request.crewCount) : null} />
              {request.timesNeedFix && (
                <p className="sm:col-span-2">
                  <Badge variant="warning">Godziny do poprawy</Badge>{" "}
                  <span className="text-xs text-muted-foreground">poza aktualnymi oknami — partner dostał e-mail.</span>
                </p>
              )}
              <Info label="Montaż" value={request.setup} />
              <Info label="Demontaż" value={request.teardown} />
              <Info
                label="Pojazd / rozładunek"
                value={request.vehicleLabel}
                icon={request.vehicle ? <Truck className="size-3.5" /> : null}
              />
              {request.submittedAt && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Wysłano: {request.submittedAt}
                  {request.lateChange && <Badge variant="warning" className="ml-2">Zmiana po terminie</Badge>}
                </p>
              )}
            </dl>

            {inPackageCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await approveBoothItemsInPackage(eventId, partnerId);
                    if (res.status === "error") toast.error(res.message ?? "Nie udało się zatwierdzić.");
                    else toast.success(res.message ?? "Zatwierdzono.");
                  })
                }
              >
                <PackageCheck /> {isPending ? "Zatwierdzanie…" : `Zatwierdź wszystko w pakiecie (${inPackageCount})`}
              </Button>
            )}

            <ul className="flex flex-col gap-2">
              {request.items.map((i) => (
                <ItemRow key={`${i.id}-${i.status}-${i.reviewed_at}`} eventId={eventId} partnerId={partnerId} item={i} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, value, icon }: { label: string; value: string | null; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1">
        {icon}
        {value ?? "—"}
      </dd>
    </div>
  );
}

type RowMode = "view" | "decide" | "change";

/**
 * Pozycja wniosku. Oczekująca: od razu przyciski decyzji. Rozstrzygnięta: decyzja, zatwierdzona
 * ilość i uwaga + „Zmień decyzję”. Każdy przycisk ma własny `key` — bez tego React przy zmianie
 * trybu używał tego samego <button> i klik „Zatwierdź inną ilość” (type=button) zamieniał go
 * w trakcie zdarzenia w „Zapisz” (type=submit), co od razu wysyłało formularz.
 */
function ItemRow({ eventId, partnerId, item }: { eventId: string; partnerId: string; item: AdminRequestItem }) {
  const [mode, setMode] = useState<RowMode>(item.status === "pending" ? "decide" : "view");
  const [state, formAction, isPending] = useActionState(async (prev: BoothDecisionState, fd: FormData) => {
    const decision = (fd.get("decision") as BoothDecision | null) ?? "approve";
    const res = await decideBoothItem(eventId, partnerId, item.id, decision, prev, fd);
    if (res.status === "success" && res.message) toast.success(res.message);
    return res;
  }, idle);
  const status = effectiveStatus(item);
  const s = ITEM_STATUS[status];
  const isOther = !item.catalog_item_id && item.label === OTHER_NEEDS_LABEL;
  const decided = item.status !== "pending";

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium">
          {item.label}
          {!isOther && (
            <span className="font-normal text-muted-foreground">
              {" "}— wnioskowano {item.qty} {item.unit}
            </span>
          )}
        </p>
        {item.note && <p className="whitespace-pre-line break-words text-muted-foreground">{item.note}</p>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {!decided && <Badge variant={s.variant}>{s.label}</Badge>}
          {item.included !== null && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              W pakiecie: {item.included}
            </Badge>
          )}
          {item.over && <Badge variant="warning">Ponad pakiet</Badge>}
        </div>
      </div>

      {mode === "view" ? (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-muted/40 p-2">
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <Badge variant={s.variant}>{s.label}</Badge>
              {!isOther && status !== "rejected" && (
                <span>
                  Zatwierdzona ilość: <strong>{approvedQty(item)}</strong> {item.unit}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Uwaga dla partnera: {item.decision_note ? item.decision_note : "—"}
            </p>
          </div>
          <Button key="edit" type="button" size="sm" variant="ghost" onClick={() => setMode("decide")}>
            <Pencil /> Zmień decyzję
          </Button>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2">
          <Input
            name="decision_note"
            maxLength={DECISION_NOTE_MAX_LENGTH}
            defaultValue={item.decision_note ?? ""}
            placeholder="Uwaga dla partnera (opcjonalnie)"
            aria-label={`Uwaga dla partnera: ${item.label}`}
            disabled={isPending}
          />
          <div className="flex flex-wrap items-center gap-2">
            {mode === "change" ? (
              <>
                <Input
                  key="qty"
                  name="approved_qty"
                  type="number"
                  min={1}
                  max={item.qty}
                  defaultValue={item.approved_qty ?? item.qty}
                  placeholder={String(item.qty)}
                  className="w-20"
                  aria-label={`Zatwierdzona ilość (wnioskowano ${item.qty})`}
                  disabled={isPending}
                  autoFocus
                />
                <span className="text-xs text-muted-foreground">z {item.qty} {item.unit}</span>
                <Button key="save-qty" type="submit" size="sm" disabled={isPending} name="decision" value="change">
                  {isPending ? "Zapisywanie…" : "Zapisz"}
                </Button>
                <Button key="cancel-qty" type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setMode("decide")}>
                  Anuluj
                </Button>
              </>
            ) : (
              <>
                <Button key="approve" type="submit" size="sm" variant="outline" disabled={isPending} name="decision" value="approve">
                  <Check /> Zatwierdź
                </Button>
                {!isOther && item.qty > 1 && (
                  <Button key="open-qty" type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setMode("change")}>
                    <CheckCheck /> Zatwierdź inną ilość
                  </Button>
                )}
                <Button key="reject" type="submit" size="sm" variant="ghost" disabled={isPending} name="decision" value="reject">
                  <X /> Odrzuć
                </Button>
                {decided && (
                  <Button key="cancel-edit" type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setMode("view")}>
                    Anuluj
                  </Button>
                )}
              </>
            )}
            {state.status === "error" && state.message && <p className="text-destructive">{state.message}</p>}
          </div>
        </form>
      )}
    </li>
  );
}
