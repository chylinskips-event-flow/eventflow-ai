"use client";

import { useActionState, useState, useId } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateParams, type MixerFormState } from "../actions";
import type { MixerRow } from "@/lib/mixer/getters";

type Props = {
  eventId: string;
  mixer: MixerRow;
  activeCount: number;
  isLive?: boolean;
};

function computeFeasibility(
  n: number,
  tableCount: number,
  seatMin: number,
  seatMax: number,
): { ok: boolean; label: string } {
  if (n < 2) return { ok: false, label: "Potrzeba co najmniej 2 aktywnych uczestników." };
  if (tableCount < 1 || seatMin < 2 || seatMax < seatMin)
    return { ok: false, label: "Sprawdź wartości parametrów." };
  if (n > tableCount * seatMax)
    return {
      ok: false,
      label: `Za mało stolików: ${n} os. > ${tableCount}×${seatMax}. Dodaj stoliki lub zwiększ max.`,
    };
  let t = tableCount;
  while (t > 0 && !(t * seatMin <= n && n <= t * seatMax)) t--;
  if (t === 0)
    return { ok: false, label: "Niewykonalne — zmień min/max osób przy stole." };
  const base = Math.floor(n / t);
  const rem = n - base * t;
  const sizes =
    rem > 0
      ? `${rem}×${base + 1} + ${t - rem}×${base}`
      : `${t}×${base}`;
  return { ok: true, label: `OK — ${sizes} os./stół (${t} stoliki aktywne)` };
}

const IDLE: MixerFormState = { status: "idle" };

export function ParamsPanel({ eventId, mixer, activeCount, isLive = false }: Props) {
  const id = useId();
  const [tableCount, setTableCount] = useState(String(mixer.table_count));
  const [seatMin, setSeatMin] = useState(String(mixer.seat_min));
  const [seatMax, setSeatMax] = useState(String(mixer.seat_max));

  const feasibility = computeFeasibility(
    activeCount,
    parseInt(tableCount) || 0,
    parseInt(seatMin) || 0,
    parseInt(seatMax) || 0,
  );

  const [state, action, isPending] = useActionState(
    updateParams.bind(null, mixer.id, eventId),
    IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-5" aria-disabled={isLive}>
      {/* Feasibility hint */}
      <div
        className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
          feasibility.ok
            ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800/40 dark:bg-green-950/30 dark:text-green-300"
            : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800/40 dark:bg-yellow-950/30 dark:text-yellow-300"
        }`}
      >
        {feasibility.ok ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        )}
        <span>
          <span className="font-medium">{activeCount} aktywnych uczestników — </span>
          {feasibility.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-tc`}>Liczba stolików</Label>
          <Input
            id={`${id}-tc`}
            name="table_count"
            type="number"
            min={1}
            value={tableCount}
            onChange={(e) => setTableCount(e.target.value)}
            disabled={isLive}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-sm`}>Min os. / stół</Label>
          <Input
            id={`${id}-sm`}
            name="seat_min"
            type="number"
            min={2}
            value={seatMin}
            onChange={(e) => setSeatMin(e.target.value)}
            disabled={isLive}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-sx`}>Max os. / stół</Label>
          <Input
            id={`${id}-sx`}
            name="seat_max"
            type="number"
            min={2}
            value={seatMax}
            onChange={(e) => setSeatMax(e.target.value)}
            disabled={isLive}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-rc`}>Liczba rund</Label>
          <Input
            id={`${id}-rc`}
            name="rounds_count"
            type="number"
            min={1}
            defaultValue={mixer.rounds_count}
            disabled={isLive}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-rm`}>Czas rundy (min)</Label>
          <Input
            id={`${id}-rm`}
            name="round_minutes"
            type="number"
            min={1}
            defaultValue={mixer.round_minutes}
            disabled={isLive}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-bm`}>Czas przerwy (min)</Label>
          <Input
            id={`${id}-bm`}
            name="break_minutes"
            type="number"
            min={0}
            defaultValue={mixer.break_minutes}
            disabled={isLive}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <Label htmlFor={`${id}-br`}>Przerwa po rundzie</Label>
          <Input
            id={`${id}-br`}
            name="break_after_round"
            type="number"
            min={1}
            placeholder="brak"
            defaultValue={mixer.break_after_round ?? ""}
            disabled={isLive}
          />
        </div>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-green-600 dark:text-green-400">Parametry zapisane.</p>
      )}

      <Button type="submit" disabled={isPending || isLive} className="self-start">
        {isPending ? "Zapisywanie..." : "Zapisz parametry"}
      </Button>
    </form>
  );
}
