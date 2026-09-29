"use client";

import { useActionState, useState } from "react";
import { uploadEventBadgeBg, type EventFormState } from "../actions";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: EventFormState = { status: "idle" };

export function BadgeBgUpload({
  eventId,
  badgeBgUrl,
}: {
  eventId: string;
  badgeBgUrl: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadEventBadgeBg.bind(null, eventId),
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const input = e.currentTarget.elements.namedItem("badge_bg") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    const error = validateImageFile(file, 5 * MB);
    if (error) {
      e.preventDefault();
      setClientError(error);
    } else {
      setClientError(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tło identyfikatora</CardTitle>
        <CardDescription>
          Własne tło wgrane tutaj zastąpi jednolity pasek koloru na identyfikatorach PDF.
          Logo z sekcji „Logo wydarzenia" wyświetli się automatycznie w nagłówku.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          onSubmit={handleSubmit}
          encType="multipart/form-data"
          className="flex flex-col gap-4"
        >
          {badgeBgUrl && (
            <img
              src={badgeBgUrl}
              alt="Tło identyfikatora"
              className="w-full max-w-[210px] rounded border object-cover"
              style={{ aspectRatio: "105/148" }}
            />
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="badge_bg">Plik tła</Label>
            <FileInput
              id="badge_bg"
              name="badge_bg"
              accept="image/jpeg,image/png,image/webp"
            />
            <p className="text-xs text-muted-foreground">
              Zalecany rozmiar: <strong>1240 × 1748 px</strong> (A6 przy 300 dpi,
              proporcje 105:148). Mniejszy obraz zostanie powiększony. JPEG, PNG lub WebP, maks. 5 MB.
            </p>
          </div>
          {clientError && (
            <p className="text-sm text-destructive">{clientError}</p>
          )}
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state.status === "success" && (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending} variant="outline">
            {isPending ? "Wgrywanie..." : "Wgraj tło"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
