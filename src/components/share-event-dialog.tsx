"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Copy, Check, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShareEventDialogProps {
  url: string;
  eventName: string;
  slug: string;
  disabled?: boolean;
}

export function ShareEventDialog({ url, eventName, slug, disabled }: ShareEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { width: 240, margin: 2, errorCorrectionLevel: "Q" })
      .then(setQrDataUrl);
  }, [open, url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadPng() {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "Q",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `rejestracja-${slug}.png`;
    a.click();
  }

  return (
    <>
      {disabled ? (
        <span
          title="Opublikuj wydarzenie, aby udostępnić link"
          className="shrink-0"
        >
          <Button variant="outline" size="sm" disabled className="pointer-events-none">
            <Share2 className="size-4" />
            Udostępnij
          </Button>
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          <Share2 className="size-4" />
          Udostępnij
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Udostępnij wydarzenie</DialogTitle>
            <DialogDescription>
              Wyślij link lub wydrukuj kod QR — uczestnicy zarejestrują się w 30 s.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                readOnly
                value={url}
                className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
              />
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? (
                  <Check className="size-4 text-green-600" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Skopiowano" : "Kopiuj link"}
              </Button>
            </div>
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`Kod QR do rejestracji na wydarzenie ${eventName}`}
                width={240}
                height={240}
                className="rounded-lg border bg-white"
              />
              <Button variant="outline" size="sm" onClick={downloadPng}>
                <Download className="size-4" />
                Pobierz PNG
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
