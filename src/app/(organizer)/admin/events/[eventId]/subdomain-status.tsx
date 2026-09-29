"use client";

import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retrySubdomain } from "./actions";

type SubdomainState = "active" | "activating" | "error" | "unknown";

interface SubdomainStatusProps {
  eventId: string;
  slug: string;
  initialState: SubdomainState;
}

export function SubdomainStatus({ eventId, slug, initialState }: SubdomainStatusProps) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "eventro.pl";
  const host = `${slug}.${rootDomain}`;
  const url = `https://${host}`;

  const [state, setState] = useState<SubdomainState>(initialState);
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const result = await retrySubdomain(eventId);
      setState(result);
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <span className="text-muted-foreground">Subdomena:</span>

      {state === "active" && (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
          <CheckCircle2 className="size-3.5 shrink-0" />
          aktywna
        </span>
      )}
      {state === "activating" && (
        <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium">
          <Clock className="size-3.5 shrink-0" />
          aktywuje się…
        </span>
      )}
      {(state === "error" || state === "unknown") && (
        <span className="inline-flex items-center gap-1 text-destructive font-medium">
          <AlertCircle className="size-3.5 shrink-0" />
          błąd
        </span>
      )}

      <span className="text-muted-foreground font-mono text-xs">{host}</span>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Otwórz ${host} w nowej karcie`}
      >
        <ExternalLink className="size-3" />
        Otwórz stronę
      </a>

      {(state === "error" || state === "unknown" || state === "activating") && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleRetry}
          disabled={isPending}
        >
          <RefreshCw className={`size-3 mr-1 ${isPending ? "animate-spin" : ""}`} />
          Ponów
        </Button>
      )}
    </div>
  );
}
