"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2, ExternalLink, FileText, LogOut, MapPin, Trash2 } from "lucide-react";
import type { PartnerContact, PartnerMaterial, ProfileDraft } from "@/lib/partner-portal";
import {
  MATERIAL_ACCEPT,
  MATERIAL_MAX_BYTES,
  PARTNER_DESCRIPTION_MAX_LENGTH,
  PARTNER_OFFER_MAX_LENGTH,
  SOCIAL_KEYS,
  SOCIAL_LABELS,
  formatBytes,
  validateMaterialFile,
  type ProfileFields,
} from "@/lib/partner-portal-core";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { signOutPartner } from "../actions";
import {
  deletePartnerMaterial,
  savePartnerContact,
  submitPartnerProfile,
  uploadPartnerMaterial,
  type PartnerActionState,
} from "./actions";

const idle: PartnerActionState = { status: "idle" };

export function PartnerPanel({
  partnerId,
  userEmail,
  eventName,
  eventDate,
  tier,
  boothLocation,
  published,
  draft,
  materials,
  contact,
  publicUrl,
}: {
  partnerId: string;
  userEmail: string;
  eventName: string;
  eventDate: string | null;
  tier: string | null;
  boothLocation: string | null;
  published: ProfileFields;
  draft: ProfileDraft | null;
  materials: PartnerMaterial[];
  contact: PartnerContact | null;
  publicUrl: string | null;
}) {
  return (
    <div className="flex flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
            <form action={signOutPartner}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="size-4" />
                Wyloguj
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-16 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
            {published.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={published.logo_url} alt="" className="size-full object-contain p-1" />
            ) : (
              <Building2 className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight">{published.name}</h1>
            <p className="text-sm text-muted-foreground">
              {eventName}
              {eventDate ? ` · ${eventDate}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {tier && <Badge variant="secondary">{tier}</Badge>}
              {boothLocation && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> Stoisko {boothLocation}
                </span>
              )}
            </div>
          </div>
        </div>

        <StatusBanner draft={draft} publicUrl={publicUrl} />
        <ProfileForm partnerId={partnerId} published={published} draft={draft} />
        <MaterialsCard partnerId={partnerId} materials={materials} />
        <ContactForm partnerId={partnerId} contact={contact} />
      </main>
    </div>
  );
}

function StatusBanner({ draft, publicUrl }: { draft: ProfileDraft | null; publicUrl: string | null }) {
  if (draft?.status === "pending") {
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        <p className="font-medium">Zmiany czekają na akceptację organizatora.</p>
        <p className="text-muted-foreground">Do tego czasu uczestnicy widzą poprzednią wersję wizytówki.</p>
      </div>
    );
  }
  if (draft?.status === "rejected") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">Organizator odrzucił ostatnie zmiany.</p>
        {draft.review_note && <p className="mt-1 whitespace-pre-line">Uwaga: {draft.review_note}</p>}
        <p className="mt-1 text-muted-foreground">Popraw wizytówkę i wyślij ponownie.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-4 text-sm">
      <p>Wizytówka jest aktualna. Każda zmiana trafia najpierw do akceptacji organizatora.</p>
      {publicUrl && (
        <Button size="sm" variant="outline" asChild>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Zobacz publicznie
          </a>
        </Button>
      )}
    </div>
  );
}

function FormMessage({ state }: { state: PartnerActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
      {state.message}
    </p>
  );
}

// ── Wizytówka ──────────────────────────────────────────────────────────────

function ProfileForm({
  partnerId,
  published,
  draft,
}: {
  partnerId: string;
  published: ProfileFields;
  draft: ProfileDraft | null;
}) {
  const current = draft ?? published;
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    (prev: PartnerActionState, fd: FormData) => submitPartnerProfile(partnerId, prev, fd),
    idle,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wizytówka firmy</CardTitle>
        <CardDescription>Widoczna dla uczestników na stronie wydarzenia (po akceptacji organizatora).</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          onSubmit={(e) => {
            const input = e.currentTarget.elements.namedItem("logo") as HTMLInputElement | null;
            const file = input?.files?.[0];
            const err = file ? validateImageFile(file, 5 * MB) : null;
            setClientError(err);
            if (err) e.preventDefault();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-name">Nazwa firmy</Label>
            <Input id="p-name" name="name" required maxLength={200} defaultValue={current.name} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="p-logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {current.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.logo_url} alt="" className="h-12 w-auto max-w-32 rounded border bg-white object-contain p-1" />
              )}
              <FileInput id="p-logo" name="logo" accept="image/jpeg,image/png,image/webp" />
            </div>
            {current.logo_url && (
              <div className="flex items-center gap-2">
                <Checkbox id="p-remove-logo" name="remove_logo" />
                <Label htmlFor="p-remove-logo" className="font-normal">Usuń logo</Label>
              </div>
            )}
            <p className="text-xs text-muted-foreground">JPG, PNG lub WebP, do 5 MB. Najlepiej na przezroczystym tle.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="p-description">Opis firmy</Label>
            <Textarea id="p-description" name="description" rows={5} maxLength={PARTNER_DESCRIPTION_MAX_LENGTH} defaultValue={current.description ?? ""} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="p-offer">Oferta / promocja dla uczestników</Label>
            <Textarea
              id="p-offer"
              name="offer"
              rows={3}
              maxLength={PARTNER_OFFER_MAX_LENGTH}
              defaultValue={current.offer ?? ""}
              placeholder="Np. -20% na roczną licencję z kodem EVENTRO20 do końca miesiąca."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="p-website">Strona www</Label>
            <Input id="p-website" name="website_url" maxLength={500} defaultValue={current.website_url ?? ""} placeholder="https://firma.pl" />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Social media</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <Label htmlFor={`p-social-${k}`} className="text-xs font-normal text-muted-foreground">
                    {SOCIAL_LABELS[k]}
                  </Label>
                  <Input id={`p-social-${k}`} name={`social_${k}`} maxLength={500} defaultValue={current.social_links[k] ?? ""} />
                </div>
              ))}
            </div>
          </fieldset>

          {clientError && <p className="text-sm text-destructive">{clientError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Wysyłanie…" : "Wyślij do akceptacji"}
            </Button>
            <FormMessage state={state} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Materiały ──────────────────────────────────────────────────────────────

const MATERIAL_STATUS = {
  pending: { label: "Czeka na akceptację", variant: "warning" },
  approved: { label: "Opublikowany", variant: "success" },
  rejected: { label: "Odrzucony", variant: "secondary" },
} as const;

function MaterialsCard({ partnerId, materials }: { partnerId: string; materials: PartnerMaterial[] }) {
  const [formKey, setFormKey] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (prev: PartnerActionState, fd: FormData) => {
      const res = await uploadPartnerMaterial(partnerId, prev, fd);
      if (res.status === "success") setFormKey((k) => k + 1);
      return res;
    },
    idle,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Materiały do pobrania</CardTitle>
        <CardDescription>Katalogi, cenniki, case studies — uczestnicy pobiorą je z Twojego profilu po akceptacji organizatora.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          key={formKey}
          action={formAction}
          onSubmit={(e) => {
            const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
            const file = input?.files?.[0] ?? null;
            const check = validateMaterialFile(file);
            setClientError(check.ok ? null : check.error);
            if (!check.ok) e.preventDefault();
          }}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-title">Tytuł</Label>
            <Input id="m-title" name="title" required maxLength={200} placeholder="Np. Katalog produktów 2026" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-file">Plik</Label>
            <FileInput id="m-file" name="file" accept={MATERIAL_ACCEPT} />
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP, PPTX lub DOCX, do {formatBytes(MATERIAL_MAX_BYTES)}.</p>
          </div>
          {clientError && <p className="text-sm text-destructive">{clientError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Wgrywanie…" : "Dodaj materiał"}
            </Button>
            <FormMessage state={state} />
          </div>
        </form>

        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak materiałów.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {materials.map((m) => (
              <MaterialRow key={m.id} partnerId={partnerId} material={m} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialRow({ partnerId, material }: { partnerId: string; material: PartnerMaterial }) {
  const [isPending, startTransition] = useTransition();
  const s = MATERIAL_STATUS[material.status];
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <FileText className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <a href={`/partner/${partnerId}/materials/${material.id}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
          {material.title}
        </a>
        <p className="break-all text-xs text-muted-foreground">
          {material.file_name} · {formatBytes(material.size_bytes)}
        </p>
        <Badge variant={s.variant} className="mt-1">{s.label}</Badge>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        aria-label="Usuń materiał"
        onClick={() => {
          if (!window.confirm(`Usunąć „${material.title}”?`)) return;
          startTransition(async () => {
            const res = await deletePartnerMaterial(partnerId, material.id);
            if (res.status === "error") toast.error(res.message ?? "Nie udało się usunąć.");
          });
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

// ── Kontakt ────────────────────────────────────────────────────────────────

function ContactForm({ partnerId, contact }: { partnerId: string; contact: PartnerContact | null }) {
  const [state, formAction, isPending] = useActionState(
    (prev: PartnerActionState, fd: FormData) => savePartnerContact(partnerId, prev, fd),
    idle,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Osoba kontaktowa</CardTitle>
        <CardDescription>Tylko dla organizatora (sprawy organizacyjne) — uczestnicy jej nie widzą.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Imię i nazwisko</Label>
              <Input id="c-name" name="contact_name" maxLength={200} defaultValue={contact?.contact_name ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-email">E-mail</Label>
              <Input id="c-email" name="contact_email" type="email" maxLength={254} defaultValue={contact?.contact_email ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-phone">Telefon</Label>
              <Input id="c-phone" name="contact_phone" maxLength={40} defaultValue={contact?.contact_phone ?? ""} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? "Zapisywanie…" : "Zapisz kontakt"}
            </Button>
            <FormMessage state={state} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
