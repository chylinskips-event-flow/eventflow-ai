"use client";

import { useState, useTransition, useCallback } from "react";
import { redeemReward, issueRewardByToken } from "./actions";
import type { RewardForEdit } from "./reward-form-dialog";
import type { CheckInResult } from "@/lib/reception";
import { QrScanner } from "@/components/qr-scanner";
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
import { QrCode, UserRound } from "lucide-react";

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
  // ── Tryb: ręczny dropdown lub skan QR ──────────────────────────────────────
  const [mode, setMode] = useState<"manual" | "qr">("manual");

  // ── Stan trybu ręcznego ───────────────────────────────────────────────────
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string>("");
  const [confirmRewardId, setConfirmRewardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Stan trybu QR ─────────────────────────────────────────────────────────
  const [qrRewardId, setQrRewardId] = useState<string>("");
  const [scannerOpen, setScannerOpen] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  // onScan dla QrScanner — memoizowane żeby uniknąć restartu kamery przy re-renderach
  const handleQrScan = useCallback(
    async (checkInToken: string): Promise<CheckInResult> => {
      if (!qrRewardId) return { ok: false, error: "not_found" };
      return issueRewardByToken(eventId, qrRewardId, checkInToken);
    },
    [eventId, qrRewardId],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <CardTitle className="text-base">Wydaj nagrodę uczestnikowi</CardTitle>
            {/* Przełącznik trybu */}
            <div className="flex rounded-lg border p-0.5 text-sm">
              <button
                onClick={() => { setMode("manual"); setError(null); setSuccessMsg(null); }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                  mode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserRound className="size-3.5" />
                Ręcznie
              </button>
              <button
                onClick={() => { setMode("qr"); setError(null); setSuccessMsg(null); }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                  mode === "qr"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <QrCode className="size-3.5" />
                Skanuj QR
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* ── Tryb ręczny ── */}
          {mode === "manual" && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Uczestnik</label>
                <Select
                  value={selectedAttendeeId}
                  onValueChange={(v) => {
                    setSelectedAttendeeId(v);
                    setError(null);
                    setSuccessMsg(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz uczestnika…" />
                  </SelectTrigger>
                  <SelectContent>
                    {attendees.map((a) => {
                      const name =
                        [a.first_name, a.last_name].filter(Boolean).join(" ") || "Uczestnik";
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          {name}
                          {a.company ? ` · ${a.company}` : ""} — {a.points} pkt
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
                        const alreadyRedeemed = redemptionSet.has(
                          `${r.id}::${selectedAttendee.id}`,
                        );
                        const outOfStock = r.stock !== null && r.stock <= 0;
                        const disabled = alreadyRedeemed || outOfStock || isPending;

                        return (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5">
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
              {successMsg && (
                <p className="text-sm text-green-600 dark:text-green-400">{successMsg}</p>
              )}
            </>
          )}

          {/* ── Tryb QR ── */}
          {mode === "qr" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Nagroda do wydania</label>
                <Select
                  value={qrRewardId}
                  onValueChange={setQrRewardId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz nagrodę…" />
                  </SelectTrigger>
                  <SelectContent>
                    {rewards.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                        {r.stock !== null ? ` (magazyn: ${r.stock})` : ""}
                        {" — "}{r.points_required} pkt
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setScannerOpen(true)}
                disabled={!qrRewardId}
                className="w-full"
              >
                <QrCode className="mr-2 size-4" />
                Otwórz skaner
              </Button>
              <p className="text-xs text-muted-foreground">
                Wybierz nagrodę, a następnie zeskanuj kod QR uczestnika (ten sam kod co przy
                wejściu). System zidentyfikuje uczestnika i wyda nagrodę.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Potwierdzenie wydania (tryb ręczny) */}
      <AlertDialog
        open={!!confirmRewardId}
        onOpenChange={(o) => {
          if (!o) setConfirmRewardId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wydać nagrodę?</AlertDialogTitle>
            <AlertDialogDescription>
              Nagroda „{confirmReward?.name}" zostanie wydana uczestnikowi{" "}
              {[selectedAttendee?.first_name, selectedAttendee?.last_name]
                .filter(Boolean)
                .join(" ")}
              .
              {confirmReward?.stock !== null && (
                <span>
                  {" "}
                  Pozostały magazyn po wydaniu: {(confirmReward?.stock ?? 1) - 1} szt.
                </span>
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

      {/* Skaner QR (tryb QR) */}
      {scannerOpen && (
        <QrScanner
          onScan={handleQrScan}
          onClose={() => setScannerOpen(false)}
          title="Wydaj nagrodę przez QR"
          successLabel="Wydano"
          alreadyLabel="Już wydano"
          notApprovedLabel="Brak w magazynie lub za mało punktów"
        />
      )}
    </>
  );
}
