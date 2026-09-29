"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckInResult } from "@/lib/reception";

type ScanFeedback =
  | { type: "idle" }
  | { type: "scanning" }
  | { type: "success"; name: string }
  | { type: "already"; name: string; checkedInAt: string }
  | { type: "not_found" }
  | { type: "not_approved" }
  | { type: "camera_error"; message: string };

interface QrScannerProps {
  onScan: (checkInToken: string) => Promise<CheckInResult>;
  onClose: () => void;
  title?: string;
  successLabel?: string;
  alreadyLabel?: string;
  notApprovedLabel?: string;
}

export function QrScanner({ onScan, onClose, title, successLabel, alreadyLabel, notApprovedLabel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastTokenRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const [feedback, setFeedback] = useState<ScanFeedback>({ type: "idle" });

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setFeedback({ type: "scanning" });
        tick();
      } catch (err) {
        const message =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Brak uprawnień do kamery. Zezwól na dostęp i odśwież stronę."
            : "Nie udało się uruchomić kamery.";
        setFeedback({ type: "camera_error", message });
      }
    }

    async function tick() {
      if (!active) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Dynamic import so jsQR isn't in server bundle
      const jsQR = (await import("jsqr")).default;
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code?.data) {
        const token = code.data;
        const now = Date.now();
        const DEBOUNCE_MS = 3000;
        if (token !== lastTokenRef.current || now - lastScanTimeRef.current > DEBOUNCE_MS) {
          lastTokenRef.current = token;
          lastScanTimeRef.current = now;
          handleToken(token);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    async function handleToken(token: string) {
      try {
        const result = await onScan(token);
        if (result.ok) {
          if (result.alreadyCheckedIn) {
            setFeedback({ type: "already", name: result.name, checkedInAt: result.checkedInAt });
          } else {
            setFeedback({ type: "success", name: result.name });
          }
        } else {
          setFeedback({ type: result.error === "not_approved" ? "not_approved" : "not_found" });
        }
        // Clear feedback after 3s, resume scanning feedback
        setTimeout(() => {
          if (active) setFeedback({ type: "scanning" });
        }, 3000);
      } catch {
        // ignore transient server errors — scanner keeps running
      }
    }

    startCamera();
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-white">{title ?? "Skaner QR"}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/10"
          aria-label="Zamknij skaner"
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* Video */}
      <div className="relative flex-1">
        <video
          ref={videoRef}
          playsInline
          muted
          className="size-full object-cover"
        />
        {/* Hidden canvas for frame decoding */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-56 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
      </div>

      {/* Feedback bar */}
      <div className="min-h-[72px] px-4 py-3">
        <FeedbackBar
          feedback={feedback}
          successLabel={successLabel}
          alreadyLabel={alreadyLabel}
          notApprovedLabel={notApprovedLabel}
        />
      </div>
    </div>
  );
}

function FeedbackBar({
  feedback,
  successLabel,
  alreadyLabel,
  notApprovedLabel,
}: {
  feedback: ScanFeedback;
  successLabel?: string;
  alreadyLabel?: string;
  notApprovedLabel?: string;
}) {
  switch (feedback.type) {
    case "idle":
      return (
        <div className="flex items-center gap-2 text-white/50">
          <Camera className="size-5 shrink-0" />
          <span className="text-sm">Uruchamianie kamery…</span>
        </div>
      );
    case "scanning":
      return (
        <div className="flex items-center gap-2 text-white/70">
          <Camera className="size-5 shrink-0" />
          <span className="text-sm">Skieruj kamerę na kod QR uczestnika</span>
        </div>
      );
    case "success":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-white">
          <CheckCircle2 className="size-5 shrink-0" />
          <span className="text-sm font-medium">{successLabel ?? "Zameldowano"}: {feedback.name}</span>
        </div>
      );
    case "already":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-white">
          <Info className="size-5 shrink-0" />
          <span className="text-sm font-medium">
            {alreadyLabel ?? "Już zameldowany"}: {feedback.name}
            {feedback.checkedInAt && (
              <> ({new Date(feedback.checkedInAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })})</>
            )}
          </span>
        </div>
      );
    case "not_found":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-white">
          <AlertCircle className="size-5 shrink-0" />
          <span className="text-sm font-medium">Nie znaleziono uczestnika</span>
        </div>
      );
    case "not_approved":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-white">
          <AlertCircle className="size-5 shrink-0" />
          <span className="text-sm font-medium">{notApprovedLabel ?? "Uczestnik nie jest zatwierdzony"}</span>
        </div>
      );
    case "camera_error":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-red-900 px-3 py-2 text-white">
          <AlertCircle className="size-5 shrink-0" />
          <span className="text-sm">{feedback.message}</span>
        </div>
      );
  }
}
