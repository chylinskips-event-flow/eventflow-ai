"use client";

import { useState, useTransition } from "react";
import { approveAttendee, rejectAttendee } from "./actions";
import { Button } from "@/components/ui/button";

export function AttendeeActions({
  eventId,
  attendeeId,
}: {
  eventId: string;
  attendeeId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveAttendee(eventId, attendeeId);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się zatwierdzić uczestnika.");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectAttendee(eventId, attendeeId);
      if (result.status === "error") {
        setError(result.message ?? "Nie udało się odrzucić uczestnika.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" onClick={handleApprove} disabled={isPending}>
          Zatwierdź
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReject}
          disabled={isPending}
        >
          Odrzuć
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
