"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Obraz z podpisanego adresu: wskaźnik ładowania do zdarzenia `load` samego obrazu (nie tylko
 * do otrzymania adresu — duże zdjęcie pobiera się jeszcze 2–4 s). Rodzic daje `key={src}`,
 * więc stan zaczyna się od nowa przy każdym zdjęciu.
 */
export function SignedImage({
  src,
  className,
  onRetry,
}: {
  src: string;
  className?: string;
  onRetry?: () => void;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <>
      {state === "loading" && (
        <Loader2 className="absolute size-7 animate-spin text-muted-foreground" aria-label="Wczytywanie zdjęcia" />
      )}
      {state === "error" ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
          Nie udało się wczytać zdjęcia.
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Spróbuj ponownie
            </Button>
          )}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- podpisany, krótkotrwały adres prywatnego bucketu
        <img
          src={src}
          alt=""
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={cn("transition-opacity duration-200", state === "loaded" ? "opacity-100" : "opacity-0", className)}
        />
      )}
    </>
  );
}

type UrlEntry = string | { error: string };

/**
 * Pełnoekranowy podgląd zdjęć: strzałki (przyciski, klawiatura), przesunięcie palcem, Escape.
 * Adres pobierany dopiero po otwarciu zdjęcia (`loadUrl`), sąsiednie zdjęcia wczytywane z wyprzedzeniem.
 */
export function PhotoViewer({
  photoIds,
  index,
  onIndexChange,
  loadUrl,
  title,
  toolbar,
}: {
  photoIds: string[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
  loadUrl: (photoId: string) => Promise<string | null>;
  title: string;
  toolbar?: React.ReactNode;
}) {
  const [urls, setUrls] = useState<Record<string, UrlEntry>>({});
  const touchX = useRef<number | null>(null);
  const photoId = index !== null ? photoIds[index] : undefined;
  const current = photoId ? urls[photoId] : undefined;
  const count = photoIds.length;

  // Bieżące zdjęcie + sąsiednie (wyprzedzające wczytanie do pamięci przeglądarki).
  const neighbours = index !== null && count > 1 ? [photoIds[(index + 1) % count], photoIds[(index - 1 + count) % count]] : [];
  const wanted = [photoId, ...neighbours].filter((id): id is string => !!id && urls[id] === undefined);
  const wantedKey = wanted.join(",");
  useEffect(() => {
    if (!wantedKey) return;
    let cancelled = false;
    for (const id of wantedKey.split(",")) {
      void loadUrl(id).then((url) => {
        if (cancelled) return;
        setUrls((prev) => ({ ...prev, [id]: url ?? { error: "Zdjęcie jest niedostępne." } }));
        if (url) new Image().src = url;
      });
    }
    return () => {
      cancelled = true;
    };
  }, [wantedKey, loadUrl]);

  const go = (delta: number) => {
    if (index === null || count === 0) return;
    onIndexChange((index + delta + count) % count);
  };
  const retry = () => {
    if (!photoId) return;
    setUrls((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  };

  return (
    <Dialog open={!!photoId} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-w-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <DialogTitle className="flex-1 truncate text-sm font-medium text-white">
            {title} {index !== null && count > 1 ? `· ${index + 1} z ${count}` : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">Podgląd zdjęcia. Strzałki zmieniają zdjęcie, Escape zamyka.</DialogDescription>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label="Zamknij podgląd"
            onClick={() => onIndexChange(null)}
          >
            <X className="size-5" />
          </Button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            touchX.current = null;
            if (start === null || end === undefined) return;
            if (end - start > 50) go(-1);
            else if (start - end > 50) go(1);
          }}
        >
          {typeof current === "string" ? (
            <SignedImage key={current} src={current} onRetry={retry} className="max-h-full max-w-full object-contain" />
          ) : current ? (
            <p className="p-6 text-sm text-white/80">{current.error}</p>
          ) : (
            <Loader2 className="size-7 animate-spin text-white/70" aria-label="Wczytywanie zdjęcia" />
          )}
          {count > 1 && (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full opacity-80 sm:inline-flex"
                aria-label="Poprzednie zdjęcie"
                onClick={() => go(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full opacity-80 sm:inline-flex"
                aria-label="Następne zdjęcie"
                onClick={() => go(1)}
              >
                <ChevronRight className="size-5" />
              </Button>
            </>
          )}
        </div>

        {toolbar && <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-3">{toolbar}</div>}
      </DialogContent>
    </Dialog>
  );
}
