"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadSectionImage, removeSectionImage, type ContentFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        encType="multipart/form-data"
        className="flex gap-2"
      >
        <Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Wgrywanie..." : "Wgraj"}
        </Button>
      </form>
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      )}
    </div>
  );
}
