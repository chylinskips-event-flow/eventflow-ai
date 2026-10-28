"use client";

import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw, CheckCircle2, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retrySubdomain } from "./actions";

type SubdomainState = "active" | "activating" | "error" | "unknown";

interface SubdomainStatusProps {
  eventId: string;
  slug: string;
  initialState: SubdomainState;
}

/**
 * Status subdomeny {slug}.{rootDomain} — dodatkowego adresu wydarzenia.
 * Główny adres to zawsze {rootDomain}/e/{slug} (buildEventApexUrl), więc
 * nieaktywna subdomena nie jest błędem strony, tylko brakiem drugiego adresu.
 *
 * "unknown" = subdomena celowo nieaktywna (szkic, brak funkcji w planie, brak konfiguracji
 * Vercel albo domeny nie ma w projekcie Vercel — 404) — wtedy tylko neutralne wyjaśnienie, bez statusu i bez „Ponów”, bo ponowienie nic nie da.
 * "error" / "activating" — próba rejestracji była, więc „Ponów” ma sens.
 */
export function SubdomainStatus({ eventId, slug, initialState }: SubdomainStatusProps) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "eventro.pl";
  const host = `${slug}.${rootDomain}`;
  const url = `https://${host}`;
  const apexLabel = `${rootDomain}/e/${slug}`;
  const apexUrl = `https://${apexLabel}`;

  const [state, setState] = useState<SubdomainState>(initialState);
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const result = await retrySubdomain(eventId);
      setState(result);
    });
  }

  const apexLink = (
    <a
      href={apexUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono underline underline-offset-2 hover:text-foreground"
    >
      {apexLabel}
    </a>
  );

  if (state === "unknown") {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        <span>
          Dodatkowy adres (subdomena) nie jest aktywny – strona działa pod {apexLink}, a linki i
          kody QR prowadzą na ten adres.
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-1">
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
        {state === "error" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
            <Info className="size-3.5 shrink-0" />
            nieaktywna
          </span>
        )}

        <span className="text-muted-foreground font-mono text-xs">{host}</span>

        {state === "active" && (
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
        )}

        {(state === "error" || state === "activating") && (
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

      {state !== "active" && (
        <p className="text-xs text-muted-foreground">
          {state === "activating"
            ? "Subdomena jeszcze nie działa. "
            : "Subdomena nie jest aktywna — to tylko dodatkowy adres. "}
          Strona wydarzenia działa pod {apexLink}, a linki i kody QR prowadzą na ten adres.
        </p>
      )}
    </div>
  );
}
