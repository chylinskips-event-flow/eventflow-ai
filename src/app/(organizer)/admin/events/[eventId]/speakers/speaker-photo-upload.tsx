"use client";

import { useActionState, useState } from "react";
import { uploadSpeakerPhoto, type SpeakerFormState } from "./actions";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SpeakerFormState = { status: "idle" };

export function SpeakerPhotoUpload({
  eventId,
  speakerId,
}: {
  eventId: string;
  speakerId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadSpeakerPhoto.bind(null, eventId, speakerId),
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem(
      "photo",
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
      <Label htmlFor="photo">Zdjęcie</Label>
      <div className="flex gap-2">
        <Input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
        />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Wgrywanie..." : "Wgraj"}
        </Button>
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
    </form>
  );
}
