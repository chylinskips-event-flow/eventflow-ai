"use client";

import { useActionState, useState } from "react";
import { uploadPartnerLogo, type PartnerFormState } from "./actions";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";

const initialState: PartnerFormState = { status: "idle" };

export function PartnerLogoUpload({
  eventId,
  partnerId,
}: {
  eventId: string;
  partnerId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadPartnerLogo.bind(null, eventId, partnerId),
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem(
      "logo",
    ) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    const error = validateImageFile(file, 5 * MB);
    if (error) {
      event.preventDefault();
      setClientError(error);
    } else {
      setClientError(null);
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      encType="multipart/form-data"
      className="flex flex-col gap-2 border-t pt-4"
    >
      <Label htmlFor="logo">Logo</Label>
      <div className="flex flex-wrap items-center gap-2">
        <FileInput
          id="logo"
          name="logo"
          accept="image/jpeg,image/png,image/webp"
        />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Wgrywanie..." : "Wgraj"}
        </Button>
      </div>
      {clientError && <p className="text-sm text-destructive">{clientError}</p>}
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      )}
    </form>
  );
}
