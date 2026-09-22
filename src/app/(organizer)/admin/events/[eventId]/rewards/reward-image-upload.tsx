"use client";

import { useActionState, useState } from "react";
import { uploadRewardImage, type RewardFormState } from "./actions";
import { validateImageFile, MB } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";

const initialState: RewardFormState = { status: "idle" };

export function RewardImageUpload({
  eventId,
  rewardId,
}: {
  eventId: string;
  rewardId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadRewardImage.bind(null, eventId, rewardId),
    initialState,
  );
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

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      encType="multipart/form-data"
      className="flex flex-col gap-2 border-t pt-3"
    >
      <Label htmlFor={`image-${rewardId}`} className="text-xs text-muted-foreground">
        Zdjęcie nagrody
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <FileInput
          id={`image-${rewardId}`}
          name="image"
          accept="image/jpeg,image/png,image/webp"
        />
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
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
