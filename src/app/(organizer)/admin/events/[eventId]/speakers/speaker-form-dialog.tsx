"use client";

import { useActionState, useState } from "react";
import { createSpeaker, updateSpeaker, type SpeakerFormState } from "./actions";
import type { Speaker } from "@/lib/speakers";
import { Button } from "@/components/ui/button";
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
import { SpeakerPhotoUpload } from "./speaker-photo-upload";

const initialState: SpeakerFormState = { status: "idle" };

export function SpeakerFormDialog({
  eventId,
  speaker,
  trigger,
}: {
  eventId: string;
  speaker?: Speaker;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [lastStatus, setLastStatus] = useState<SpeakerFormState["status"]>("idle");

  const action = speaker
    ? updateSpeaker.bind(null, eventId, speaker.id)
    : createSpeaker.bind(null, eventId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  if (state.status !== lastStatus) {
    setLastStatus(state.status);
    if (state.status === "success" && !speaker && !state.warning) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {speaker ? "Edytuj prelegenta" : "Dodaj prelegenta"}
          </DialogTitle>
          <DialogDescription>
            {speaker
              ? "Zaktualizuj dane prelegenta."
              : "Dodaj nowego prelegenta do tego eventu."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          encType="multipart/form-data"
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="first_name">Imię</Label>
              <Input
                id="first_name"
                name="first_name"
                defaultValue={speaker?.first_name ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last_name">Nazwisko</Label>
              <Input
                id="last_name"
                name="last_name"
                defaultValue={speaker?.last_name ?? ""}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Firma (opcjonalnie)</Label>
            <Input
              id="company"
              name="company"
              defaultValue={speaker?.company ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">Bio (opcjonalnie)</Label>
            <Textarea id="bio" name="bio" defaultValue={speaker?.bio ?? ""} />
          </div>
          {!speaker && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="photo">Zdjęcie (opcjonalnie)</Label>
              <Input
                id="photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
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
          {state.status === "success" && speaker && !state.warning && (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Zapisywanie..." : speaker ? "Zapisz zmiany" : "Dodaj prelegenta"}
          </Button>
        </form>

        {speaker && <SpeakerPhotoUpload eventId={eventId} speakerId={speaker.id} />}
      </DialogContent>
    </Dialog>
  );
}
