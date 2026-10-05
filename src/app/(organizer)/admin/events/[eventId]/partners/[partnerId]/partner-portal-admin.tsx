"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, FileText, UserX, X } from "lucide-react";
import type { PartnerContact, PartnerMaterial, ProfileDraft } from "@/lib/partner-portal";
import {
  ACCESS_STATUS_LABELS,
  PROFILE_FIELD_LABELS,
  SOCIAL_KEYS,
  SOCIAL_LABELS,
  formatBytes,
  type AccessStatus,
  type ProfileFields,
} from "@/lib/partner-portal-core";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  approvePartnerDraft,
  invitePartnerUser,
  rejectPartnerDraft,
  revokePartnerAccess,
  reviewPartnerMaterial,
  type PortalAdminState,
} from "./actions";

const idle: PortalAdminState = { status: "idle" };

type AccessView = {
  id: string;
  email: string;
  status: AccessStatus;
  invited_at: string;
  last_seen_at: string | null;
  inviteUrl: string | null;
};

const STATUS_VARIANT: Record<AccessStatus, "success" | "secondary" | "warning" | "outline"> = {
  active: "success",
  invited: "warning",
  expired: "outline",
  revoked: "secondary",
};

export function PartnerPortalAdmin({
  eventId,
  partnerId,
  access,
  published,
  draft,
  changed,
  materials,
  contact,
  timezone,
}: {
  eventId: string;
  partnerId: string;
  access: AccessView[];
  published: ProfileFields;
  draft: ProfileDraft | null;
  changed: (keyof ProfileFields)[];
  materials: PartnerMaterial[];
  contact: PartnerContact | null;
  timezone: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AccessSection eventId={eventId} partnerId={partnerId} access={access} timezone={timezone} />
      <DraftSection eventId={eventId} partnerId={partnerId} published={published} draft={draft} changed={changed} />
      <MaterialsSection eventId={eventId} partnerId={partnerId} materials={materials} />
      <ContactSection contact={contact} />
    </div>
  );
}

function useAdminAction() {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<PortalAdminState>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.status === "error") toast.error(res.message ?? "Coś poszło nie tak.");
      else if (res.message) toast.success(res.message);
    });
  return { isPending, run };
}

function CopyButton({ value, label = "Kopiuj link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Nie udało się skopiować — zaznacz link ręcznie.");
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Skopiowano" : label}
    </Button>
  );
}

// ── Dostęp ─────────────────────────────────────────────────────────────────

function AccessSection({
  eventId,
  partnerId,
  access,
  timezone,
}: {
  eventId: string;
  partnerId: string;
  access: AccessView[];
  timezone: string | null;
}) {
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: PortalAdminState, formData: FormData) => {
      const res = await invitePartnerUser(eventId, partnerId, prev, formData);
      if (res.status === "success") setFormKey((k) => k + 1);
      return res;
    },
    idle,
  );
  const current = access.filter((a) => a.status !== "revoked");
  const revoked = access.filter((a) => a.status === "revoked");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dostęp do panelu partnera</CardTitle>
        <CardDescription>
          Zaproś osobę z firmy partnera — dostanie e-mail z linkiem i zaloguje się bez hasła
          (jednorazowy link na swój adres). Partner widzi tylko swój panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form key={formKey} action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="invite-email">E-mail osoby od partnera</Label>
            <Input id="invite-email" name="email" type="email" required placeholder="marketing@firma.pl" />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Wysyłanie…" : "Zaproś"}
          </Button>
        </form>
        {state.message && (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 text-sm",
              state.status === "error" ? "border-destructive/40 text-destructive" : "bg-muted/40",
            )}
          >
            <p>{state.message}</p>
            {state.inviteUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-background px-2 py-1 text-xs">{state.inviteUrl}</code>
                <CopyButton value={state.inviteUrl} />
              </div>
            )}
          </div>
        )}

        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nikt jeszcze nie ma dostępu.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {current.map((a) => (
              <AccessRow key={a.id} eventId={eventId} partnerId={partnerId} access={a} timezone={timezone} />
            ))}
          </ul>
        )}
        {revoked.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Unieważnione ({revoked.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
              {revoked.map((a) => (
                <li key={a.id} className="line-through">{a.email}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function AccessRow({
  eventId,
  partnerId,
  access,
  timezone,
}: {
  eventId: string;
  partnerId: string;
  access: AccessView;
  timezone: string | null;
}) {
  const { isPending, run } = useAdminAction();
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-all">{access.email}</span>
        <Badge variant={STATUS_VARIANT[access.status]}>{ACCESS_STATUS_LABELS[access.status]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Zaproszono {formatDateTime(access.invited_at, timezone)}
        {access.last_seen_at ? ` · ostatnio w panelu ${formatDateTime(access.last_seen_at, timezone)}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {access.inviteUrl && <CopyButton value={access.inviteUrl} label="Kopiuj link zaproszenia" />}
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (window.confirm(`Unieważnić dostęp ${access.email}? Osoba natychmiast straci dostęp do panelu.`)) {
              run(() => revokePartnerAccess(eventId, partnerId, access.id));
            }
          }}
        >
          <UserX className="size-4" />
          Unieważnij
        </Button>
      </div>
    </li>
  );
}

// ── Zmiany profilu ─────────────────────────────────────────────────────────

function FieldValue({ field, profile }: { field: keyof ProfileFields; profile: ProfileFields }) {
  if (field === "logo_url") {
    return profile.logo_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.logo_url} alt="" className="h-14 w-auto max-w-40 rounded border bg-white object-contain p-1" />
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (field === "social_links") {
    const entries = SOCIAL_KEYS.filter((k) => profile.social_links[k]);
    if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <ul className="flex flex-col gap-0.5">
        {entries.map((k) => (
          <li key={k} className="break-all">
            {SOCIAL_LABELS[k]}: {profile.social_links[k]}
          </li>
        ))}
      </ul>
    );
  }
  const value = profile[field];
  return value ? (
    <span className="whitespace-pre-line break-words">{value}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function DraftSection({
  eventId,
  partnerId,
  published,
  draft,
  changed,
}: {
  eventId: string;
  partnerId: string;
  published: ProfileFields;
  draft: ProfileDraft | null;
  changed: (keyof ProfileFields)[];
}) {
  const { isPending, run } = useAdminAction();
  const [rejectState, rejectAction, rejecting] = useActionState(
    (prev: PortalAdminState, fd: FormData) => rejectPartnerDraft(eventId, partnerId, prev, fd),
    idle,
  );

  return (
    <Card className={cn(draft?.status === "pending" && "border-amber-400")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Zmiany w wizytówce
          {draft?.status === "pending" && <Badge variant="warning">Do akceptacji</Badge>}
          {draft?.status === "rejected" && <Badge variant="secondary">Odrzucone — czeka na poprawki</Badge>}
        </CardTitle>
        <CardDescription>
          Zmiany partnera trafiają na stronę wydarzenia dopiero po Twojej akceptacji.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!draft ? (
          <p className="text-sm text-muted-foreground">Brak zmian do przejrzenia.</p>
        ) : (
          <>
            {changed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Zgłoszona wersja nie różni się od opublikowanej.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {changed.map((f) => (
                  <div key={f} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[8rem_1fr_1fr]">
                    <span className="font-medium">{PROFILE_FIELD_LABELS[f]}</span>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Teraz</p>
                      <FieldValue field={f} profile={published} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400">Proponowane</p>
                      <FieldValue field={f} profile={draft} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {draft.status === "rejected" && draft.review_note && (
              <p className="text-sm text-muted-foreground">Twoja uwaga: {draft.review_note}</p>
            )}
            {draft.status === "pending" && (
              <div className="flex flex-col gap-3 border-t pt-4">
                <Button
                  className="w-fit"
                  disabled={isPending}
                  onClick={() => run(() => approvePartnerDraft(eventId, partnerId))}
                >
                  <Check className="size-4" />
                  Akceptuj i opublikuj
                </Button>
                <form action={rejectAction} className="flex flex-col gap-2">
                  <Label htmlFor="reject-note">Albo odrzuć z uwagą dla partnera</Label>
                  <Textarea id="reject-note" name="note" rows={2} maxLength={1000} placeholder="Np. Prosimy o logo na przezroczystym tle." />
                  <Button type="submit" variant="outline" className="w-fit" disabled={rejecting}>
                    <X className="size-4" />
                    Odrzuć
                  </Button>
                  {rejectState.message && (
                    <p className={cn("text-sm", rejectState.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                      {rejectState.message}
                    </p>
                  )}
                </form>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Materiały ──────────────────────────────────────────────────────────────

const MATERIAL_STATUS = {
  pending: { label: "Do akceptacji", variant: "warning" },
  approved: { label: "Opublikowany", variant: "success" },
  rejected: { label: "Odrzucony", variant: "secondary" },
} as const;

function MaterialsSection({
  eventId,
  partnerId,
  materials,
}: {
  eventId: string;
  partnerId: string;
  materials: PartnerMaterial[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Materiały do pobrania</CardTitle>
        <CardDescription>Uczestnicy widzą tylko materiały zaakceptowane przez Ciebie.</CardDescription>
      </CardHeader>
      <CardContent>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Partner nie dodał materiałów.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {materials.map((m) => (
              <MaterialRow key={m.id} eventId={eventId} partnerId={partnerId} material={m} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialRow({ eventId, partnerId, material }: { eventId: string; partnerId: string; material: PartnerMaterial }) {
  const { isPending, run } = useAdminAction();
  const s = MATERIAL_STATUS[material.status];
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center", material.status === "pending" && "border-amber-400")}>
      <FileText className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{material.title}</p>
        <p className="text-xs text-muted-foreground break-all">
          {material.file_name} · {formatBytes(material.size_bytes)}
        </p>
      </div>
      <Badge variant={s.variant}>{s.label}</Badge>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" asChild>
          <a href={`/admin/events/${eventId}/partners/${partnerId}/materials/${material.id}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Podgląd
          </a>
        </Button>
        {material.status !== "approved" && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => reviewPartnerMaterial(eventId, partnerId, material.id, "approved"))}>
            Akceptuj
          </Button>
        )}
        {material.status !== "rejected" && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => reviewPartnerMaterial(eventId, partnerId, material.id, "rejected"))}>
            {material.status === "approved" ? "Wycofaj" : "Odrzuć"}
          </Button>
        )}
      </div>
    </li>
  );
}

// ── Kontakt ────────────────────────────────────────────────────────────────

function ContactSection({ contact }: { contact: PartnerContact | null }) {
  const rows = [
    ["Osoba", contact?.contact_name],
    ["E-mail", contact?.contact_email],
    ["Telefon", contact?.contact_phone],
  ].filter(([, v]) => v);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Osoba kontaktowa (wewnętrznie)</CardTitle>
        <CardDescription>Uzupełnia partner w swoim panelu. Niewidoczne dla uczestników.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak danych kontaktowych.</p>
        ) : (
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
