"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { PRINTER_UNSUPPORTED_MESSAGE, printerErrorMessage, type BadgeLabelResult } from "@/lib/badge-label-core";
import { drawBadgeLabel } from "@/lib/badge-label-canvas";
import { isBluetoothPrintingSupported, loadPrinterDriver, printBadgeLabel } from "@/lib/badge-label-printer";

/**
 * Podgląd i druk etykiety jednej osoby. Dane są gotowe przed kliknięciem „Drukuj”, bo przeglądarka
 * pokazuje okno wyboru drukarki Bluetooth tylko bezpośrednio po kliknięciu.
 */
export function BadgeLabelDialog({
  attendeeId,
  loadLabel,
  onClose,
}: {
  attendeeId: string;
  loadLabel: (attendeeId: string) => Promise<BadgeLabelResult>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<BadgeLabelResult | null>(null);
  const [supported] = useState(isBluetoothPrintingSupported);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLabel(attendeeId)
      .catch((): BadgeLabelResult => ({ ok: false, error: "Nie udało się przygotować etykiety." }))
      .then((res) => {
        if (!cancelled) setResult(res);
      });
    if (supported) void loadPrinterDriver();
    return () => {
      cancelled = true;
    };
  }, [attendeeId, loadLabel, supported]);

  useEffect(() => {
    if (result?.ok && canvas.current) drawBadgeLabel(canvas.current, result.label);
  }, [result]);

  async function print() {
    if (!canvas.current) return;
    setPrinting(true);
    setStatus(null);
    try {
      await printBadgeLabel(canvas.current);
      setStatus({ ok: true, text: "Wydrukowano." });
    } catch (e) {
      const text = printerErrorMessage(e);
      if (text) setStatus({ ok: false, text });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Drukuj identyfikator</DialogTitle>
        <DialogDescription>Etykieta 50 × 30 mm na drukarkę Niimbot B1 (Bluetooth).</DialogDescription>

        {!result && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Przygotowywanie etykiety" />
          </div>
        )}
        {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
        {result?.ok && (
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Podgląd etykiety: ${result.label.name}`}
            className="mx-auto w-full max-w-[384px] rounded-md border bg-white [image-rendering:pixelated]"
          />
        )}

        {!supported && <p className="text-sm text-muted-foreground">{PRINTER_UNSUPPORTED_MESSAGE}</p>}
        {status && (
          <p role="status" className={status.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"}>
            {status.text}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={printing}>
            Zamknij
          </Button>
          <Button onClick={() => void print()} disabled={!supported || !result?.ok || printing}>
            {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            {printing ? "Drukowanie…" : status?.ok ? "Drukuj ponownie" : "Drukuj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
