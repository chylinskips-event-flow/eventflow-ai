"use client";

import { useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedTestAttendees } from "./actions";

export function SeedAttendeesButton({ eventId }: { eventId: string }) {
  const [isPending, start] = useTransition();

  function handleSeed() {
    start(async () => {
      const result = await seedTestAttendees(eventId);
      if (result.status === "error") alert(result.message);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      <FlaskConical className="size-4 shrink-0" />
      <span className="flex-1">Dane testowe — dodaj 20 uczestników, aby przetestować generację planu.</span>
      <Button variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
        {isPending ? "Dodawanie..." : "Zasiej 20 uczestników"}
      </Button>
    </div>
  );
}
