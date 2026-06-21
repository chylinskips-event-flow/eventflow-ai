"use client";

import { useActionState, useState } from "react";
import { createSection, updateSection, type ContentFormState } from "./actions";
import type { EventContentSection } from "@/lib/event-content";
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
import { SectionImageUpload } from "./section-image-upload";

const initialState: ContentFormState = { status: "idle" };

export function SectionFormDialog({
  eventId,
  section,
  trigger,
}: {
  eventId: string;
  section?: EventContentSection;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [lastStatus, setLastStatus] = useState<ContentFormState["status"]>("idle");

  const action = section
    ? updateSection.bind(null, eventId, section.id)
    : createSection.bind(null, eventId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  if (state.status !== lastStatus) {
    setLastStatus(state.status);
    if (state.status === "success" && !section && !state.warning) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {section ? "Edytuj sekcję" : "Dodaj sekcję"}
          </DialogTitle>
          <DialogDescription>
            {section
              ? "Zaktualizuj treść tej sekcji."
              : "Dodaj nową sekcję opisu do strony tego eventu."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          encType="multipart/form-data"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Tytuł</Label>
            <Input
              id="title"
              name="title"
              defaultValue={section?.title ?? ""}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="body">Treść</Label>
            <Textarea
              id="body"
              name="body"
              defaultValue={section?.body ?? ""}
              required
            />
          </div>
          {!section && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="image">Zdjęcie (opcjonalnie)</Label>
              <Input
                id="image"
                name="image"
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
          {state.status === "success" && section && !state.warning && (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Zapisywanie..." : section ? "Zapisz zmiany" : "Dodaj sekcję"}
          </Button>
        </form>

        {section && (
          <SectionImageUpload
            eventId={eventId}
            sectionId={section.id}
            imageUrl={section.image_url}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
