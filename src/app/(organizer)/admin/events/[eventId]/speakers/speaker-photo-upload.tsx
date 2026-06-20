"use client";

import { useActionState } from "react";
import { uploadSpeakerPhoto, type SpeakerFormState } from "./actions";
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

  return (
    <form
      action={formAction}
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
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      )}
    </form>
  );
}
