"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/gallery-core";
import type { FinalizeResult, PhotoMeta, StartUploadResult } from "@/lib/gallery";
import { cn } from "@/lib/utils";

/**
 * Wgrywanie wielu zdjęć (panel organizatora i strona fotografa):
 * skrót SHA-256 w przeglądarce → rezerwacja (akcja serwera, zwraca podpisany adres) →
 * wysyłka pliku PROSTO do Supabase Storage (z pominięciem limitu 4,5 MB funkcji Vercela,
 * z paskiem postępu) → przetworzenie na serwerze. Po 3 pliki naraz; błędy z „Ponów”.
 */

type ItemStatus = "queued" | "hashing" | "uploading" | "processing" | "done" | "skipped" | "error";

type Item = { key: string; file: File; status: ItemStatus; progress: number; message?: string };

const CONCURRENCY = 3;

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PUT do podpisanego adresu Storage (format jak uploadToSignedUrl z supabase-js) z postępem. */
function putToSignedUrl(url: string, file: File, contentType: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    // Typ z walidacji (HEIC na Windows przychodzi bez typu MIME).
    body.append("", new Blob([file], { type: contentType }), file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "true");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

export function PhotoUploader({
  start,
  finalize,
  onUploaded,
  disabled,
  disabledReason,
}: {
  start: (meta: PhotoMeta) => Promise<StartUploadResult>;
  finalize: (photoId: string) => Promise<FinalizeResult>;
  /** Po zakończeniu kolejki, gdy co najmniej jedno zdjęcie się wgrało (np. odświeżenie siatki). */
  onUploaded?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function processItem(item: Item): Promise<boolean> {
    const check = validatePhotoFile(item.file);
    if (!check.ok) {
      update(item.key, { status: "error", message: check.error });
      return false;
    }
    try {
      update(item.key, { status: "hashing", progress: 0, message: undefined });
      const hash = await sha256Hex(item.file);
      const res = await start({ name: item.file.name, type: item.file.type, size: item.file.size, hash });
      if (!res.ok) {
        update(item.key, { status: res.skipped ? "skipped" : "error", message: res.error });
        return false;
      }
      update(item.key, { status: "uploading" });
      try {
        await putToSignedUrl(res.signedUrl, item.file, res.contentType, (p) => update(item.key, { progress: p }));
      } catch {
        update(item.key, { status: "error", message: "Wysyłka przerwana. Sprawdź połączenie i ponów." });
        return false;
      }
      update(item.key, { status: "processing", progress: 100 });
      const fin = await finalize(res.photoId);
      if (!fin.ok) {
        update(item.key, { status: "error", message: fin.error });
        return false;
      }
      update(item.key, { status: "done" });
      return true;
    } catch {
      update(item.key, { status: "error", message: "Coś poszło nie tak. Ponów wysyłkę." });
      return false;
    }
  }

  async function runQueue(queue: Item[]) {
    setRunning(true);
    let uploaded = 0;
    let index = 0;
    const worker = async () => {
      while (index < queue.length) {
        const item = queue[index++];
        if (await processItem(item)) uploaded++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
    if (uploaded > 0) onUploaded?.();
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added: Item[] = Array.from(files).map((file) => ({
      key: `f${++seq.current}`,
      file,
      status: "queued",
      progress: 0,
    }));
    setItems((prev) => [...added, ...prev.filter((i) => i.status !== "done" && i.status !== "skipped")]);
    if (inputRef.current) inputRef.current.value = "";
    void runQueue(added);
  }

  const retry = (item: Item) => void runQueue([item]);

  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const active = items.filter((i) => ["queued", "hashing", "uploading", "processing"].includes(i.status)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PHOTO_ACCEPT}
          className="sr-only"
          id="photo-uploader-input"
          disabled={disabled}
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Wybierz zdjęcia
        </Button>
        <span className="text-xs text-muted-foreground">
          {disabled && disabledReason ? disabledReason : "JPEG, PNG, WebP lub HEIC, do 15 MB na plik."}
        </span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-sm text-muted-foreground">
            {active > 0 ? `Wysyłanie… pozostało ${active}. ` : ""}
            Wgrane: {done}
            {failed > 0 ? ` · Błędy: ${failed}` : ""}
          </p>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-lg border p-2">
            {items.map((item) => (
              <li key={item.key} className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <StatusIcon status={item.status} />
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  {item.status === "error" && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => retry(item)}>
                      <RotateCcw className="size-3.5" />
                      Ponów
                    </Button>
                  )}
                </div>
                {(item.status === "uploading" || item.status === "processing") && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className={cn("h-full bg-primary transition-all", item.status === "processing" && "animate-pulse")}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.message && (
                  <p className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>{item.message}</p>
                )}
                {item.status === "processing" && <p className="text-xs text-muted-foreground">Przetwarzanie…</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === "done") return <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label="Wgrane" />;
  if (status === "error") return <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="Błąd" />;
  if (status === "skipped") return <AlertCircle className="size-4 shrink-0 text-muted-foreground" aria-label="Pominięte" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="W toku" />;
}
