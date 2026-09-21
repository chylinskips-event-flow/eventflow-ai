"use client";

import { useActionState, useState } from "react";
import { createPartner, updatePartner, type PartnerFormState } from "./actions";
import type { Partner } from "@/lib/partners";
import { PARTNER_TIERS } from "@/lib/partner-options";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PartnerLogoUpload } from "./partner-logo-upload";

const initialState: PartnerFormState = { status: "idle" };
const NO_TIER_VALUE = "__none__";

export function PartnerFormDialog({
  eventId,
  partner,
  trigger,
}: {
  eventId: string;
  partner?: Partner;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [lastStatus, setLastStatus] =
    useState<PartnerFormState["status"]>("idle");
  const [tier, setTier] = useState(partner?.tier ?? NO_TIER_VALUE);
  const [logoClientError, setLogoClientError] = useState<string | null>(null);

  const action = partner
    ? updatePartner.bind(null, eventId, partner.id)
    : createPartner.bind(null, eventId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!partner) {
      const input = e.currentTarget.elements.namedItem("logo") as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (file) {
        const err = validateImageFile(file, 5 * MB);
        if (err) {
          e.preventDefault();
          setLogoClientError(err);
          return;
        }
      }
      setLogoClientError(null);
    }
  }

  if (state.status !== lastStatus) {
    setLastStatus(state.status);
    if (state.status === "success" && !partner && !state.warning) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {partner ? "Edytuj partnera" : "Dodaj partnera"}
          </DialogTitle>
          <DialogDescription>
            {partner
              ? "Zaktualizuj dane partnera."
              : "Dodaj nowego partnera do tego eventu."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          onSubmit={handleSubmit}
          encType="multipart/form-data"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nazwa</Label>
            <Input
              id="name"
              name="name"
              defaultValue={partner?.name ?? ""}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tier">Poziom (opcjonalnie)</Label>
              <input
                type="hidden"
                name="tier"
                value={tier === NO_TIER_VALUE ? "" : tier}
              />
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger id="tier" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TIER_VALUE}>Nie wybrano</SelectItem>
                  {PARTNER_TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="booth_location">Stoisko (opcjonalnie)</Label>
              <Input
                id="booth_location"
                name="booth_location"
                defaultValue={partner?.booth_location ?? ""}
                placeholder="Stoisko A3"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Opis (opcjonalnie)</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={partner?.description ?? ""}
            />
          </div>
          {!partner && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="logo">Logo (opcjonalnie)</Label>
              <FileInput
                id="logo"
                name="logo"
                accept="image/jpeg,image/png,image/webp"
                disabled={isPending}
              />
              {logoClientError && (
                <p className="text-sm text-destructive">{logoClientError}</p>
              )}
            </div>
          )}
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state.status === "success" && state.warning && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              {state.message}
            </p>
          )}
          {state.status === "success" && partner && !state.warning && (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Zapisywanie..."
              : partner
                ? "Zapisz zmiany"
                : "Dodaj partnera"}
          </Button>
        </form>

        {partner && (
          <PartnerLogoUpload eventId={eventId} partnerId={partner.id} />
        )}
      </DialogContent>
    </Dialog>
  );
}
