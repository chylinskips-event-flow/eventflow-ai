"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Flag, Loader2, UserCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { PhotoViewer } from "@/components/photo-viewer";
import { REPORT_KIND_LABELS, REPORT_MESSAGE_MAX, type ReportKind } from "@/lib/gallery-core";
import type { ParticipantPhoto, ParticipantPhotoPage } from "@/lib/gallery-participant";
import { cn } from "@/lib/utils";
import {
  getParticipantPhotoDownload,
  getParticipantPhotoView,
  loadParticipantPhotos,
  reportParticipantPhoto,
  toggleParticipantPhotoTag,
} from "./actions";

type Filter = "all" | "mine";

export function ParticipantGallery({ slug, initial }: { slug: string; initial: ParticipantPhotoPage }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [photos, setPhotos] = useState<ParticipantPhoto[]>(initial.photos);
  const [nextOffset, setNextOffset] = useState<number | null>(initial.nextOffset);
  const [totals, setTotals] = useState({ total: initial.total, mine: initial.mineTotal });
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [reporting, setReporting] = useState<ParticipantPhoto | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (nextFilter: Filter, offset: number) =>
    startTransition(async () => {
      const res = await loadParticipantPhotos(slug, { mine: nextFilter === "mine", offset });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFilter(nextFilter);
      setPhotos((prev) => (offset === 0 ? res.page.photos : [...prev, ...res.page.photos]));
      setNextOffset(res.page.nextOffset);
      setTotals({ total: res.page.total, mine: res.page.mineTotal });
      if (offset === 0) setViewIndex(null);
    });

  const loadUrl = useCallback((photoId: string) => getParticipantPhotoView(slug, photoId), [slug]);

  /** Zdjęcie znika z listy (zgłoszone, albo „To ja” wyłączone w filtrze „Moje zdjęcia”). */
  function removeFromList(photoId: string) {
    const i = photos.findIndex((p) => p.id === photoId);
    const next = photos.filter((p) => p.id !== photoId);
    setPhotos(next);
    if (viewIndex !== null) setViewIndex(next.length === 0 ? null : Math.min(i, next.length - 1));
  }

  const current = viewIndex !== null ? photos[viewIndex] : undefined;

  function toggleMine(photo: ParticipantPhoto) {
    const on = !photo.mine;
    startTransition(async () => {
      if (!(await toggleParticipantPhotoTag(slug, photo.id, on))) {
        toast.error("Nie udało się zapisać. Odśwież stronę.");
        return;
      }
      setTotals((t) => ({ ...t, mine: Math.max(0, t.mine + (on ? 1 : -1)) }));
      if (!on && filter === "mine") removeFromList(photo.id);
      else setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, mine: on } : p)));
    });
  }

  function download(photo: ParticipantPhoto) {
    startTransition(async () => {
      const url = await getParticipantPhotoDownload(slug, photo.id);
      if (!url) {
        toast.error("Zdjęcie jest niedostępne.");
        return;
      }
      // Adres ważny 60 s; nazwę pliku nadaje Storage (Content-Disposition).
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function onReported(photoId: string, message: string) {
    setReporting(null);
    setTotals((t) => ({
      total: Math.max(0, t.total - 1),
      mine: photos.find((p) => p.id === photoId)?.mine ? Math.max(0, t.mine - 1) : t.mine,
    }));
    removeFromList(photoId);
    toast.success(message);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Filtr zdjęć" className="flex gap-2">
        {(
          [
            ["all", `Wszystkie (${totals.total})`],
            ["mine", `Moje zdjęcia (${totals.mine})`],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            role="radio"
            aria-checked={filter === key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            disabled={pending}
            onClick={() => filter !== key && load(key, 0)}
          >
            {label}
          </Button>
        ))}
      </div>

      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filter === "mine"
            ? "Nie masz jeszcze oznaczonych zdjęć. Otwórz zdjęcie i wybierz „To ja”."
            : "W galerii nie ma jeszcze zdjęć."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
          {photos.map((p, i) => (
            <li key={p.id} className="relative">
              <button
                type="button"
                onClick={() => setViewIndex(i)}
                className="block aspect-square w-full overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Otwórz zdjęcie ${i + 1}`}
              >
                {p.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- podpisany, krótkotrwały adres prywatnego bucketu
                  <img src={p.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </button>
              {p.mine && (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-primary p-1 text-primary-foreground" title="To ja">
                  <UserCheck className="size-3" aria-label="Oznaczone: to ja" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextOffset !== null && (
        <Button variant="outline" className="self-center" disabled={pending} onClick={() => load(filter, nextOffset)}>
          {pending && <Loader2 className="size-4 animate-spin" />} Pokaż więcej
        </Button>
      )}

      <PhotoViewer
        photoIds={photos.map((p) => p.id)}
        index={viewIndex}
        onIndexChange={setViewIndex}
        loadUrl={loadUrl}
        title="Zdjęcie"
        toolbar={
          current && (
            <>
              <Button
                size="sm"
                variant={current.mine ? "default" : "secondary"}
                aria-pressed={current.mine}
                disabled={pending}
                onClick={() => toggleMine(current)}
              >
                {current.mine ? <UserCheck className="size-4" /> : <UserRound className="size-4" />}
                To ja
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => download(current)}>
                <Download className="size-4" /> Pobierz
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || !current.reportable}
                title={current.reportable ? undefined : "To zdjęcie było już przez Ciebie zgłoszone."}
                onClick={() => setReporting(current)}
              >
                <Flag className="size-4" /> {current.reportable ? "Zgłoś zdjęcie" : "Zgłoszone"}
              </Button>
            </>
          )
        }
      />

      {reporting && (
        <ReportDialog slug={slug} photo={reporting} onClose={() => setReporting(null)} onReported={onReported} />
      )}
    </div>
  );
}

function ReportDialog({
  slug,
  photo,
  onClose,
  onReported,
}: {
  slug: string;
  photo: ParticipantPhoto;
  onClose: () => void;
  onReported: (photoId: string, message: string) => void;
}) {
  const [kind, setKind] = useState<ReportKind>("remove_me");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reportParticipantPhoto(slug, photo.id, kind, message);
      if (res.ok) onReported(photo.id, res.message);
      else setError(res.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[60]">
        <DialogTitle>Zgłoś zdjęcie</DialogTitle>
        <DialogDescription>
          Po wysłaniu zdjęcie od razu zniknie z galerii, a organizator zdecyduje, czy je usunąć.
        </DialogDescription>
        <div role="radiogroup" aria-label="Powód zgłoszenia" className="flex flex-col gap-2">
          {(Object.keys(REPORT_KIND_LABELS) as ReportKind[]).map((k) => (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm",
                kind === k && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="report-kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="accent-primary"
              />
              {REPORT_KIND_LABELS[k]}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-message">
            Wiadomość do organizatora {kind === "other" ? "" : "(opcjonalnie)"}
          </Label>
          <Textarea
            id="report-message"
            value={message}
            maxLength={REPORT_MESSAGE_MAX}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {message.length}/{REPORT_MESSAGE_MAX}
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Wyślij zgłoszenie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
