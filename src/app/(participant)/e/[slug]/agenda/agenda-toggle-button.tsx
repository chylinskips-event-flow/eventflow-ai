"use client";

import { useState, useTransition } from "react";
import { toggleAgendaItem } from "./actions";
import { Button } from "@/components/ui/button";

export function AgendaToggleButton({
  slug,
  sessionId,
  initialInAgenda,
}: {
  slug: string;
  sessionId: string;
  initialInAgenda: boolean;
}) {
  const [inAgenda, setInAgenda] = useState(initialInAgenda);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const next = !inAgenda;
    setInAgenda(next); // optimistic — reaguje natychmiast, nie czeka na round-trip

    startTransition(async () => {
      const result = await toggleAgendaItem(slug, sessionId);
      if (result.status === "error") {
        setInAgenda(!next); // revert przy błędzie
        setError(result.message ?? "Nie udało się zaktualizować agendy.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={inAgenda ? "outline" : "default"}
        onClick={handleClick}
        disabled={isPending}
      >
        {inAgenda ? "✓ W mojej agendzie" : "Dodaj do mojej agendy"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
