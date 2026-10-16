"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CheckCheck, PackageCheck, Truck, X } from "lucide-react";
import {
  DECISION_NOTE_MAX_LENGTH,
  ITEM_QTY_MAX,
  ITEM_STATUS,
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

function ItemRow({ eventId, partnerId, item }: { eventId: string; partnerId: string; item: AdminRequestItem }) {
  const [mode, setMode] = useState<"idle" | "change">("idle");
  const [state, formAction, isPending] = useActionState(async (prev: BoothDecisionState, fd: FormData) => {
    const decision = (fd.get("decision") as BoothDecision | null) ?? "approve";
    const res = await decideBoothItem(eventId, partnerId, item.id, decision, prev, fd);
    if (res.status === "success" && res.message) toast.success(res.message);
    return res;
  }, idle);
  const s = ITEM_STATUS[item.status];
  const isOther = !item.catalog_item_id && item.label === OTHER_NEEDS_LABEL;

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {item.label}
            {!isOther && (
              <span className="font-normal text-muted-foreground">
                {" "}— {item.qty} {item.unit}
              </span>
            )}
          </p>
          {item.note && <p className="whitespace-pre-line break-words text-muted-foreground">{item.note}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant={s.variant}>{s.label}</Badge>
            {item.status === "changed" && (
              <Badge variant="outline" className="font-normal">
                Zatwierdzono: {item.approved_qty ?? 0} {item.unit}
              </Badge>
            )}
            {item.included !== null && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                W pakiecie: {item.included}
              </Badge>
            )}
            {item.over && <Badge variant="warning">Ponad pakiet</Badge>}
          </div>
          {item.decision_note && <p className="mt-1 text-xs text-muted-foreground">Twoja uwaga: {item.decision_note}</p>}
        </div>
      </div>

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
                name="approved_qty"
                type="number"
                min={0}
                max={ITEM_QTY_MAX}
                defaultValue={item.approved_qty ?? item.qty}
                className="w-20"
                aria-label="Zatwierdzona ilość"
                disabled={isPending}
                autoFocus
              />
              <Button type="submit" size="sm" disabled={isPending} name="decision" value="change">
                {isPending ? "Zapisywanie…" : "Zapisz ilość"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setMode("idle")}>
                Anuluj
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" size="sm" variant="outline" disabled={isPending} name="decision" value="approve">
                <Check /> Zatwierdź
              </Button>
              {!isOther && (
                <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setMode("change")}>
                  <CheckCheck /> Zatwierdź inną ilość
                </Button>
              )}
              <Button type="submit" size="sm" variant="ghost" disabled={isPending} name="decision" value="reject">
                <X /> Odrzuć
              </Button>
            </>
          )}
          {state.status === "error" && state.message && <p className="text-destructive">{state.message}</p>}
        </div>
      </form>
    </li>
  );
}
