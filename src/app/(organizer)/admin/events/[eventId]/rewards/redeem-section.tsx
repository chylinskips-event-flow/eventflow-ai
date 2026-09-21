"use client";

import { useState, useTransition } from "react";
import { redeemReward } from "./actions";
import type { RewardForEdit } from "./reward-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AttendeeOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  points: number;
};

type RedemptionRecord = { reward_id: string; attendee_id: string };

export function RedeemSection({
  eventId,
  rewards,
  attendees,
  existingRedemptions,
}: {
  eventId: string;
  rewards: RewardForEdit[];
  attendees: AttendeeOption[];
  existingRedemptions: RedemptionRecord[];
}) {
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string>("");
  const [confirmRewardId, setConfirmRewardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAttendee = attendees.find((a) => a.id === selectedAttendeeId);

  const redemptionSet = new Set(
    existingRedemptions.map((r) => `${r.reward_id}::${r.attendee_id}`),
  );

  const affordableRewards = selectedAttendee
    ? rewards.filter((r) => selectedAttendee.points >= r.points_required)
    : [];

  const confirmReward = rewards.find((r) => r.id === confirmRewardId);

  function handleConfirm() {
    if (!confirmRewardId || !selectedAttendeeId) return;
    setError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const result = await redeemReward(eventId, confirmRewardId, selectedAttendeeId);
      setConfirmRewardId(null);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się wydać nagrody.");
      } else {
        setSuccessMsg(result.message ?? "Nagroda wydana.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wydaj nagrodę uczestnikowi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Uczestnik</label>
          <Select value={selectedAttendeeId} onValueChange={(v) => {
            setSelectedAttendeeId(v);
            setError(null);
            setSuccessMsg(null);
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz uczestnika…" />
            </SelectTrigger>
            <SelectContent>
              {attendees.map((a) => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "Uczestnik";
                return (
                  <SelectItem key={a.id} value={a.id}>
                    {name}{a.company ? ` · ${a.company}` : ""} — {a.points} pkt
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {selectedAttendee && (
          <div className="flex flex-col gap-2">
            {affordableRewards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Uczestnik nie ma wystarczającej liczby punktów na żadną nagrodę.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {affordableRewards.map((r) => {
                  const alreadyRedeemed = redemptionSet.has(`${r.id}::${selectedAttendee.id}`);
                  const outOfStock = r.stock !== null && r.stock <= 0;
                  const disabled = alreadyRedeemed || outOfStock || isPending;

                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.points_required} pkt
                          {r.stock !== null ? ` · Magazyn: ${r.stock} szt.` : ""}
                          {alreadyRedeemed ? " · Już odebrana" : ""}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyRedeemed ? "outline" : "default"}
                        disabled={disabled}
                        onClick={() => setConfirmRewardId(r.id)}
                      >
                        {alreadyRedeemed ? "Odebrana" : outOfStock ? "Brak" : "Wydaj"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {successMsg && <p className="text-sm text-green-600 dark:text-green-400">{successMsg}</p>}
      </CardContent>

      <AlertDialog open={!!confirmRewardId} onOpenChange={(o) => { if (!o) setConfirmRewardId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wydać nagrodę?</AlertDialogTitle>
            <AlertDialogDescription>
              Nagroda „{confirmReward?.name}" zostanie wydana uczestnikowi{" "}
              {[selectedAttendee?.first_name, selectedAttendee?.last_name].filter(Boolean).join(" ")}.
              {confirmReward?.stock !== null && (
                <span> Pozostały magazyn po wydaniu: {(confirmReward?.stock ?? 1) - 1} szt.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Wydawanie..." : "Potwierdź"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
