"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadSectionImage, removeSectionImage, type ContentFormState } from "./actions";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";

const initialState: ContentFormState = { status: "idle" };

export function SectionImageUpload({
  eventId,
  sectionId,
  imageUrl,
}: {
  eventId: string;
  sectionId: string;
  imageUrl: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadSectionImage.bind(null, eventId, sectionId),
    initialState,
  );

  const [isRemoving, startRemoveTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem(
      "image",
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

  function handleRemove() {
    setRemoveError(null);
    startRemoveTransition(async () => {
      const result = await removeSectionImage(eventId, sectionId);
      if (result.status === "error") {
        setRemoveError(result.message ?? "Nie udało się usunąć zdjęcia.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Label htmlFor="image">Zdjęcie sekcji</Label>
      {imageUrl && (
        <div className="flex items-center gap-3">
          <img
            src={imageUrl}
            alt="Zdjęcie sekcji"
            className="h-16 w-16 rounded border object-cover"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            {isRemoving ? "Usuwanie..." : "Usuń zdjęcie"}
          </Button>
        </div>
      )}
      {removeError && <p className="text-sm text-destructive">{removeError}</p>}
      <form
        action={formAction}
        onSubmit={handleSubmit}
        encType="multipart/form-data"
        className="flex flex-wrap items-center gap-2"
      >
        <FileInput id="image" name="image" accept="image/jpeg,image/png,image/webp" />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Wgrywanie..." : "Wgraj"}
        </Button>
      </form>
      {clientError && (
        <p className="text-sm text-destructive">{clientError}</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      )}
    </div>
  );
}
