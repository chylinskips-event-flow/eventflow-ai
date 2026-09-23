"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMixer, type MixerFormState } from "./actions";

const IDLE: MixerFormState = { status: "idle" };

export function CreateMixerDialog({
  eventId,
  trigger,
}: {
  eventId: string;
  trigger: React.ReactNode;
}) {
  const [state, action, isPending] = useActionState(
    createMixer.bind(null, eventId),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowy Business Mixer</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={action} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mixer-name">Nazwa</Label>
            <Input
              id="mixer-name"
              name="name"
              placeholder="np. Networking Runda 1"
              required
            />
          </div>
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state.status === "success" && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Mixer utworzony.
            </p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Tworzenie..." : "Utwórz mixer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
