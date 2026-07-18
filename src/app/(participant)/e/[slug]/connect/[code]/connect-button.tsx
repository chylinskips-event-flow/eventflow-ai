"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { connectViaCode } from "./actions";

/**
 * Sukces akcji kończy się server-side redirectem do /contacts, więc do klienta
 * wraca tylko ewentualny błąd (redirect rzuca kontrolowany wyjątek, którego
 * useTransition nie traktuje jak porażki).
 */
export function ConnectButton({ slug, code }: { slug: string; code: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await connectViaCode(slug, code);
      // Dotrze tu tylko przy błędzie — przy sukcesie akcja przekierowała.
      if (result?.status === "error") {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" onClick={handleClick} disabled={isPending}>
        {isPending ? "Nawiązywanie..." : "Nawiąż kontakt"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
