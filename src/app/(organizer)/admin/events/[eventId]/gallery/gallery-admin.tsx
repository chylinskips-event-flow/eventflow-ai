"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Eye, EyeOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PhotoUploader } from "@/components/photo-uploader";
import { BUDGET_BLOCKED_MESSAGE, DEFAULT_GALLERY_INFO_TEXT, MAX_PHOTOS_PER_EVENT, formatBytes } from "@/lib/gallery-core";
import { cn } from "@/lib/utils";
import {
  createGalleryUploadLink,
  deleteGalleryPhotos,
  finalizeGalleryUpload,
  revokeGalleryUploadLink,
  saveGallerySettingsAction,
  setGalleryPhotosHidden,
  setGalleryPublished,
  startGalleryUpload,
  type GalleryAdminState,
} from "./actions";

const idle: GalleryAdminState = { status: "idle" };

export type PhotoView = { id: string; thumbUrl: string | null; hidden: boolean; watermarked: boolean; source: string };

export type UsageView = {
  count: number;
  eventBytes: number;
  budgetUsedBytes: number;
  budgetBytes: number;
  warn: boolean;
  blocked: boolean;
};

function FormMessage({ state }: { state: GalleryAdminState }) {
  if (!state.message) return null;
  return (
    <p className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-green-700 dark:text-green-400")}>
      {state.message}
    </p>
  );
}

// ── Zdjęcia ────────────────────────────────────────────────────────────────

export function GalleryPhotosPanel({ eventId, photos, usage }: { eventId: string; photos: PhotoView[]; usage: UsageView }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const limitReached = usage.count >= MAX_PHOTOS_PER_EVENT;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (fn: () => Promise<GalleryAdminState>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
      else after?.();
    });

  const budgetPct = Math.min(100, Math.round((usage.budgetUsedBytes / Math.max(1, usage.budgetBytes)) * 100));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Wgraj zdjęcia</CardTitle>
          <CardDescription>
            Zdjęcia są zmniejszane do 2560 px i zapisywane jako JPEG (z logo organizatora, jeśli znak wodny jest
            włączony). Oryginały nie są przechowywane.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PhotoUploader
            start={(meta) => startGalleryUpload(eventId, meta)}
            finalize={(id) => finalizeGalleryUpload(eventId, id)}
            onUploaded={() => router.refresh()}
            disabled={limitReached || usage.blocked}
            disabledReason={limitReached ? `Osiągnięto limit ${MAX_PHOTOS_PER_EVENT} zdjęć.` : BUDGET_BLOCKED_MESSAGE}
          />
          <div className="flex flex-col gap-1.5 text-sm">
            <p>
              <span className="font-medium tabular-nums">
                {usage.count} / {MAX_PHOTOS_PER_EVENT}
              </span>{" "}
              zdjęć · {formatBytes(usage.eventBytes)}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div
                className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Miejsce na galerie"
                aria-valuenow={budgetPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className={cn("h-full", usage.warn ? "bg-amber-500" : "bg-primary")} style={{ width: `${budgetPct}%` }} />
              </div>
              Miejsce na galerie (wszystkie wydarzenia): {formatBytes(usage.budgetUsedBytes)} z {formatBytes(usage.budgetBytes)}
            </div>
            {usage.warn && !usage.blocked && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                Zajęte ponad 80% miejsca na galerie. Usuń zbędne zdjęcia (np. z zakończonych wydarzeń), zanim miejsce się skończy.
              </p>
            )}
            {usage.blocked && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {BUDGET_BLOCKED_MESSAGE}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nie ma jeszcze zdjęć. Wgraj je powyżej albo utwórz link dla fotografa.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)))}
            >
              {selected.size === photos.length ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
            </Button>
            {selected.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">Zaznaczone: {selected.size}</span>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setGalleryPhotosHidden(eventId, [...selected], true), () => setSelected(new Set()))}>
                  <EyeOff className="size-4" /> Ukryj
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setGalleryPhotosHidden(eventId, [...selected], false), () => setSelected(new Set()))}>
                  <Eye className="size-4" /> Pokaż
                </Button>
                <Button size="sm" variant="destructive" disabled={isPending} onClick={() => setConfirmIds([...selected])}>
                  <Trash2 className="size-4" /> Usuń
                </Button>
              </>
            )}
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => {
              const isSelected = selected.has(p.id);
              return (
                <li key={p.id} className={cn("group relative overflow-hidden rounded-lg border bg-muted", isSelected && "ring-2 ring-primary")}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={isSelected}
                    aria-label={isSelected ? "Odznacz zdjęcie" : "Zaznacz zdjęcie"}
                    className="block aspect-[4/3] w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {p.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- podpisany, krótkotrwały adres prywatnego bucketu
                      <img src={p.thumbUrl} alt="" loading="lazy" className={cn("size-full object-cover", p.hidden && "opacity-40")} />
                    ) : (
                      <span className="flex size-full items-center justify-center text-xs text-muted-foreground">Brak podglądu</span>
                    )}
                  </button>
                  <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
                    {isSelected && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </span>
                    )}
                    {p.hidden && <Badge variant="secondary">Ukryte</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-1 border-t bg-background px-2 py-1">
                    <span className="truncate text-xs text-muted-foreground" title={p.source}>
                      {p.source}
                    </span>
                    <div className="flex shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={isPending}
                        aria-label={p.hidden ? "Pokaż uczestnikom" : "Ukryj przed uczestnikami"}
                        title={p.hidden ? "Pokaż uczestnikom" : "Ukryj przed uczestnikami"}
                        onClick={() => run(() => setGalleryPhotosHidden(eventId, [p.id], !p.hidden))}
                      >
                        {p.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        disabled={isPending}
                        aria-label="Usuń zdjęcie"
                        title="Usuń zdjęcie"
                        onClick={() => setConfirmIds([p.id])}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AlertDialog open={confirmIds !== null} onOpenChange={(o) => !o && setConfirmIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmIds && confirmIds.length > 1 ? `Usunąć ${confirmIds.length} zdjęć?` : "Usunąć zdjęcie?"}
            </AlertDialogTitle>
            <AlertDialogDescription>Usunięcia nie można cofnąć — pliki zostaną skasowane.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ids = confirmIds ?? [];
                setConfirmIds(null);
                run(() => deleteGalleryPhotos(eventId, ids), () => setSelected(new Set()));
              }}
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Fotograf ───────────────────────────────────────────────────────────────

export type LinkView = {
  id: string;
  label: string;
  url: string;
  state: "active" | "revoked" | "expired";
  expiresLabel: string | null;
  maxPhotos: number | null;
  photoCount: number;
};

export function GalleryLinksPanel({ eventId, links }: { eventId: string; links: LinkView[] }) {
  const [formKey, setFormKey] = useState(0);
  // Po utworzeniu linku czyścimy formularz (nowy klucz = świeże pola).
  const [state, formAction, isPending] = useActionState(async (prev: GalleryAdminState, fd: FormData) => {
    const res = await createGalleryUploadLink(eventId, prev, fd);
    if (res.status === "success") setFormKey((k) => k + 1);
    return res;
  }, idle);

  const active = links.filter((l) => l.state === "active");
  const inactive = links.filter((l) => l.state !== "active");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Link dla fotografa</CardTitle>
          <CardDescription>
            Fotograf wgrywa zdjęcia przez link — bez zakładania konta i bez dostępu do galerii. Link możesz
            w każdej chwili unieważnić.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={formKey} action={formAction} className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="gl-label">Nazwa fotografa</Label>
              <Input id="gl-label" name="label" required maxLength={100} placeholder="np. Anna Kowalska" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gl-expires">Ważny do (opcjonalnie)</Label>
              <Input id="gl-expires" name="expires_at" type="datetime-local" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gl-max">Limit zdjęć (opcjonalnie)</Label>
              <Input id="gl-max" name="max_photos" type="number" min={1} max={MAX_PHOTOS_PER_EVENT} inputMode="numeric" />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <FormMessage state={state} />
              <Button type="submit" disabled={isPending} className="w-fit">
                Utwórz link
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {active.length > 0 && (
        <ul className="flex flex-col gap-3">
          {active.map((l) => (
            <LinkRow key={l.id} eventId={eventId} link={l} />
          ))}
        </ul>
      )}

      {inactive.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Nieaktywne linki ({inactive.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {inactive.map((l) => (
              <li key={l.id}>
                <span className="line-through">{l.label}</span> · {l.state === "revoked" ? "unieważniony" : "wygasł"} · zdjęć: {l.photoCount}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LinkRow({ eventId, link }: { eventId: string; link: LinkView }) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nie udało się skopiować — zaznacz link ręcznie.");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{link.label}</span>
        <Badge variant="secondary">
          zdjęć: {link.photoCount}
          {link.maxPhotos ? ` / ${link.maxPhotos}` : ""}
        </Badge>
        {link.expiresLabel && <span className="text-xs text-muted-foreground">ważny do {link.expiresLabel}</span>}
      </div>
      <code className="break-all rounded bg-muted px-2 py-1 text-xs">{link.url}</code>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Skopiowano" : "Kopiuj"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Otwórz
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (window.confirm(`Unieważnić link „${link.label}”? Fotograf nie wgra już przez niego zdjęć.`)) {
              startTransition(async () => {
                const res = await revokeGalleryUploadLink(eventId, link.id);
                if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
              });
            }
          }}
        >
          Unieważnij
        </Button>
      </div>
    </li>
  );
}

// ── Ustawienia ─────────────────────────────────────────────────────────────

export function GallerySettingsPanel({
  eventId,
  settings,
  hasLogo,
}: {
  eventId: string;
  settings: { enabled: boolean; watermarkEnabled: boolean; infoText: string; publishedLabel: string | null };
  hasLogo: boolean;
}) {
  const [state, formAction, isPending] = useActionState(saveGallerySettingsAction.bind(null, eventId), idle);
  const [isPublishing, startPublish] = useTransition();

  const publish = (value: boolean) =>
    startPublish(async () => {
      const res = await setGalleryPublished(eventId, value);
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
      else toast.success(res.message ?? "Zapisano.");
    });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Publikacja</CardTitle>
          <CardDescription>
            Galerię widzą tylko uczestnicy, którzy byli na wydarzeniu (mają zapisane wejście w recepcji). Do
            publikacji widzą komunikat „Galeria pojawi się wkrótce”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {settings.publishedLabel ? (
            <>
              <Badge variant="success">Opublikowana {settings.publishedLabel}</Badge>
              <Button variant="outline" size="sm" disabled={isPublishing} onClick={() => publish(false)}>
                Cofnij publikację
              </Button>
            </>
          ) : (
            <>
              <Badge variant="secondary">Nieopublikowana</Badge>
              <Button size="sm" disabled={isPublishing} onClick={() => publish(true)}>
                Opublikuj galerię
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ustawienia galerii</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="g-enabled" className="font-medium">Galeria dla uczestników</Label>
                <p className="text-sm text-muted-foreground">Pozycja „Zdjęcia” w panelu uczestnika.</p>
              </div>
              <Switch id="g-enabled" name="enabled" defaultChecked={settings.enabled} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="g-watermark" className="font-medium">Znak wodny (logo organizatora)</Label>
                <p className="text-sm text-muted-foreground">
                  {hasLogo
                    ? "Logo z zakładki Branding w prawym dolnym rogu zdjęcia."
                    : "Dodaj logo w Ustawieniach → Branding — bez logo zdjęcia są bez znaku."}{" "}
                  Zmiana dotyczy zdjęć wgranych od teraz — ustaw logo i znak wodny przed wydarzeniem.
                </p>
              </div>
              <Switch id="g-watermark" name="watermark_enabled" defaultChecked={settings.watermarkEnabled} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-info">Informacja o zdjęciach dla uczestników</Label>
              <Textarea id="g-info" name="info_text" rows={4} maxLength={1000} defaultValue={settings.infoText} placeholder={DEFAULT_GALLERY_INFO_TEXT} />
              <p className="text-xs text-muted-foreground">Puste pole = tekst domyślny.</p>
            </div>
            <FormMessage state={state} />
            <Button type="submit" disabled={isPending} className="w-fit">
              Zapisz ustawienia
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
