"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendeeAsOrganizer } from "./actions";
import type { Attendee } from "@/lib/attendees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditAttendeeButton({
  eventId,
  attendee,
}: {
  eventId: string;
  attendee: Attendee;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateAttendeeAsOrganizer(eventId, attendee.id, formData);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się zapisać zmian.");
        return;
      }
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isPending) return;
        setError(null);
        setIsOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Edytuj
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edytuj uczestnika</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ea-first">Imię</Label>
              <Input
                id="ea-first"
                name="first_name"
                defaultValue={attendee.first_name ?? ""}
                maxLength={100}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ea-last">Nazwisko</Label>
              <Input
                id="ea-last"
                name="last_name"
                defaultValue={attendee.last_name ?? ""}
                maxLength={100}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ea-email">E-mail *</Label>
            <Input
              id="ea-email"
              name="email"
              type="email"
              required
              defaultValue={attendee.email ?? ""}
              maxLength={255}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ea-company">Firma</Label>
            <Input
              id="ea-company"
              name="company"
              defaultValue={attendee.company ?? ""}
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ea-job">Stanowisko</Label>
            <Input
              id="ea-job"
              name="job_title"
              defaultValue={attendee.job_title ?? ""}
              maxLength={200}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
