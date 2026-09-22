"use client";

import { useActionState, useState } from "react";
import { createReward, updateReward, type RewardFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type RewardForEdit = {
  id: string;
  name: string;
  description: string | null;
  points_required: number;
  stock: number | null;
  badge_label: string | null;
  image_url: string | null;
};

const initialState: RewardFormState = { status: "idle" };

export function RewardFormDialog({
  eventId,
  reward,
  trigger,
}: {
  eventId: string;
  reward?: RewardForEdit;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setEpoch((e) => e + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reward ? "Edytuj nagrodę" : "Dodaj nagrodę"}</DialogTitle>
        </DialogHeader>
        <RewardFormContent
          key={epoch}
          eventId={eventId}
          reward={reward}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RewardFormContent({
  eventId,
  reward,
  onClose,
}: {
  eventId: string;
  reward?: RewardForEdit;
  onClose: () => void;
}) {
  const action = reward
    ? updateReward.bind(null, eventId, reward.id)
    : createReward.bind(null, eventId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  if (state.status === "success") {
    onClose();
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nazwa</Label>
        <Input id="name" name="name" required defaultValue={reward?.name ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Opis (opcjonalnie)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={reward?.description ?? ""}
          className="min-h-[72px] text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="points_required">Próg punktowy</Label>
        <Input
          id="points_required"
          name="points_required"
          type="number"
          min={0}
          required
          defaultValue={reward?.points_required ?? 0}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="stock">Stan magazynu (puste = nieograniczony)</Label>
        <Input
          id="stock"
          name="stock"
          type="number"
          min={0}
          defaultValue={reward?.stock ?? ""}
          placeholder="np. 5"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="badge_label">Odznaka narożna (opcjonalnie, maks. 20 znaków)</Label>
        <Input
          id="badge_label"
          name="badge_label"
          maxLength={20}
          defaultValue={reward?.badge_label ?? ""}
          placeholder="np. Bestseller"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Anuluj
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Zapisywanie..." : reward ? "Zapisz zmiany" : "Dodaj nagrodę"}
        </Button>
      </div>
    </form>
  );
}
