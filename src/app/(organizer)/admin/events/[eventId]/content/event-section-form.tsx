"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventSection, FaqItem, NoclegItem, HighlightItem, HighlightIcon } from "@/lib/event-sections";
import { HIGHLIGHT_ICONS } from "@/lib/event-sections";
import {
  updateEventSectionContent,
  uploadGaleriaImage,
  removeGaleriaImage,
} from "./event-sections-actions";

interface Props {
  eventId: string;
  section: EventSection;
  open: boolean;
  onClose: () => void;
}

export function EventSectionForm({ eventId, section, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edytuj sekcję</DialogTitle>
        </DialogHeader>
        <SectionFormBody
          eventId={eventId}
          section={section}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function SectionFormBody({ eventId, section, onClose }: Omit<Props, "open">) {
  const type = section.type;
  const c = section.content as Record<string, unknown>;

  if (type === "opis") return <OpisForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  if (type === "faq") return <FaqForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  if (type === "cta") return <CtaForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  if (type === "dojazd") return <DojazdForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  if (type === "nocleg") return <NoclegForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  if (type === "galeria") return <GaleriaForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  if (type === "highlights") return <HighlightsForm eventId={eventId} section={section} content={c} onClose={onClose} />;
  return null;
}

// ---- Shared helpers ----------------------------------------------------

function SaveFooter({ onClose, pending, error }: { onClose: () => void; pending: boolean; error: string | null }) {
  return (
    <DialogFooter className="flex-col gap-2 sm:flex-row">
      {error && <p className="text-sm text-destructive flex-1">{error}</p>}
      <Button variant="outline" type="button" onClick={onClose} disabled={pending}>Anuluj</Button>
      <Button type="submit" disabled={pending}>{pending ? "Zapisuję…" : "Zapisz"}</Button>
    </DialogFooter>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---- Opis --------------------------------------------------------------

function OpisForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const [body, setBody] = useState((content.body as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, { heading: heading || undefined, body });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldRow label="Nagłówek (opcjonalnie)">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. O konferencji" />
      </FieldRow>
      <FieldRow label="Treść (Markdown)">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Opis wydarzenia w formacie Markdown…" required />
      </FieldRow>
      <SaveFooter onClose={onClose} pending={pending} error={error} />
    </form>
  );
}

// ---- FAQ ---------------------------------------------------------------

function FaqForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const [items, setItems] = useState<FaqItem[]>(Array.isArray(content.items) ? (content.items as FaqItem[]) : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addItem() { setItems((prev) => [...prev, { q: "", a: "" }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: "q" | "a", value: string) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, { heading: heading || undefined, items });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldRow label="Nagłówek (opcjonalnie)">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. Często zadawane pytania" />
      </FieldRow>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Pytanie {i + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Input value={item.q} onChange={(e) => updateItem(i, "q", e.target.value)} placeholder="Pytanie" required />
            <Textarea value={item.a} onChange={(e) => updateItem(i, "a", e.target.value)} rows={3} placeholder="Odpowiedź" required />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-fit">
          <Plus className="size-4 mr-1" /> Dodaj pytanie
        </Button>
      </div>
      <SaveFooter onClose={onClose} pending={pending} error={error} />
    </form>
  );
}

// ---- CTA ---------------------------------------------------------------

function CtaForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const [subtext, setSubtext] = useState((content.subtext as string) ?? "");
  const [buttonLabel, setButtonLabel] = useState((content.button_label as string) ?? "");
  const [buttonHref, setButtonHref] = useState((content.button_href as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, {
        heading, subtext: subtext || undefined, button_label: buttonLabel, button_href: buttonHref,
      });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldRow label="Nagłówek">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. Dołącz do nas!" required />
      </FieldRow>
      <FieldRow label="Podtytuł (opcjonalnie)">
        <Input value={subtext} onChange={(e) => setSubtext(e.target.value)} placeholder="np. Miejsca są ograniczone" />
      </FieldRow>
      <FieldRow label="Etykieta przycisku">
        <Input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} placeholder="np. Zarejestruj się" required />
      </FieldRow>
      <FieldRow label="Adres URL przycisku">
        <Input value={buttonHref} onChange={(e) => setButtonHref(e.target.value)} placeholder="https://… lub /e/slug/register" required />
      </FieldRow>
      <SaveFooter onClose={onClose} pending={pending} error={error} />
    </form>
  );
}

// ---- Dojazd ------------------------------------------------------------

function DojazdForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const [address, setAddress] = useState((content.address as string) ?? "");
  const [directionsUrl, setDirectionsUrl] = useState((content.directions_url as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, {
        heading: heading || undefined, address, directions_url: directionsUrl || undefined,
      });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldRow label="Nagłówek (opcjonalnie)">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. Jak do nas dojechać" />
      </FieldRow>
      <FieldRow label="Adres">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ul. Przykładowa 1, 00-000 Warszawa" required />
      </FieldRow>
      <FieldRow label="Link do trasy (opcjonalnie)">
        <Input value={directionsUrl} onChange={(e) => setDirectionsUrl(e.target.value)} placeholder="https://maps.google.com/…" />
      </FieldRow>
      <SaveFooter onClose={onClose} pending={pending} error={error} />
    </form>
  );
}

// ---- Nocleg ------------------------------------------------------------

function NoclegForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const [items, setItems] = useState<NoclegItem[]>(Array.isArray(content.items) ? (content.items as NoclegItem[]) : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addItem() { setItems((prev) => [...prev, { name: "", url: "", note: "", distance: "" }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof NoclegItem, value: string) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = items.map(({ name, url, note, distance }) => ({
      name, ...(url ? { url } : {}), ...(note ? { note } : {}), ...(distance ? { distance } : {}),
    }));
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, { heading: heading || undefined, items: cleaned });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldRow label="Nagłówek (opcjonalnie)">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. Polecane noclegi" />
      </FieldRow>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Hotel/Nocleg {i + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}><Trash2 className="size-3.5" /></Button>
            </div>
            <Input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Nazwa hotelu" required />
            <Input value={item.url ?? ""} onChange={(e) => updateItem(i, "url", e.target.value)} placeholder="Strona WWW (opcjonalnie)" />
            <div className="flex gap-2">
              <Input value={item.distance ?? ""} onChange={(e) => updateItem(i, "distance", e.target.value)} placeholder="Odległość (np. 500m)" className="flex-1" />
              <Input value={item.note ?? ""} onChange={(e) => updateItem(i, "note", e.target.value)} placeholder="Notatka (opcjonalnie)" className="flex-1" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-fit">
          <Plus className="size-4 mr-1" /> Dodaj hotel
        </Button>
      </div>
      <SaveFooter onClose={onClose} pending={pending} error={error} />
    </form>
  );
}

// ---- Galeria -----------------------------------------------------------

function GaleriaForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const images = Array.isArray(content.images)
    ? (content.images as { storage_path: string; alt?: string; _publicUrl?: string }[])
    : [];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleHeadingSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, {
        ...(content),
        heading: heading || undefined,
      });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("image", file);
    const result = await uploadGaleriaImage(eventId, section.id, fd);
    setUploading(false);
    if (!result.ok) setUploadError(result.error ?? "Błąd uploadu.");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleRemove(storagePath: string) {
    startTransition(async () => {
      await removeGaleriaImage(eventId, section.id, storagePath);
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleHeadingSave} className="flex flex-col gap-4">
        <FieldRow label="Nagłówek (opcjonalnie)">
          <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. Galeria" />
        </FieldRow>
        <SaveFooter onClose={onClose} pending={pending} error={error} />
      </form>

      <div className="border-t pt-4">
        <p className="text-sm font-medium mb-3">Zdjęcia ({images.length})</p>
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {images.map((img) => {
              const url = img._publicUrl ?? `${supabaseUrl}/storage/v1/object/public/event-sections/${img.storage_path}`;
              return (
                <div key={img.storage_path} className="relative group aspect-square">
                  <img src={url} alt={img.alt ?? ""} className="w-full h-full object-cover rounded-lg" loading="lazy" />
                  <button
                    type="button"
                    onClick={() => handleRemove(img.storage_path)}
                    className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Usuń zdjęcie"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="size-4 mr-1" />{uploading ? "Wgrywam…" : "Dodaj zdjęcie"}
          </Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      </div>
    </div>
  );
}

// ---- Highlights --------------------------------------------------------

function HighlightsForm({ eventId, section, content, onClose }: { eventId: string; section: EventSection; content: Record<string, unknown>; onClose: () => void }) {
  const [heading, setHeading] = useState((content.heading as string) ?? "");
  const [items, setItems] = useState<HighlightItem[]>(Array.isArray(content.items) ? (content.items as HighlightItem[]) : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addItem() { setItems((prev) => [...prev, { title: "", text: "", icon: undefined }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof HighlightItem, value: string) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value || undefined } : it));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = items.map(({ title, text, icon }) => ({
      title, ...(text ? { text } : {}), ...(icon ? { icon } : {}),
    }));
    startTransition(async () => {
      const result = await updateEventSectionContent(eventId, section.id, { heading: heading || undefined, items: cleaned });
      if (!result.ok) { setError(result.error ?? "Błąd."); return; }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldRow label="Nagłówek (opcjonalnie)">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="np. Dlaczego warto?" />
      </FieldRow>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Punkt {i + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}><Trash2 className="size-3.5" /></Button>
            </div>
            <Input value={item.title} onChange={(e) => updateItem(i, "title", e.target.value)} placeholder="Tytuł punktu" required />
            <Input value={item.text ?? ""} onChange={(e) => updateItem(i, "text", e.target.value)} placeholder="Opis (opcjonalnie)" />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Ikona (opcjonalnie)</Label>
              <select
                value={item.icon ?? ""}
                onChange={(e) => updateItem(i, "icon", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— bez ikony —</option>
                {HIGHLIGHT_ICONS.map((icon) => (
                  <option key={icon} value={icon}>{icon}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-fit">
          <Plus className="size-4 mr-1" /> Dodaj punkt
        </Button>
      </div>
      <SaveFooter onClose={onClose} pending={pending} error={error} />
    </form>
  );
}
