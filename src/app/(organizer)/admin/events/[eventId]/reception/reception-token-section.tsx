"use client";

import { useState, useTransition } from "react";
import { Copy, Check, RefreshCw, ShieldOff, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  organizerGenerateReceptionToken,
  organizerRevokeReceptionToken,
} from "./actions";

interface ReceptionTokenSectionProps {
  eventId: string;
  receptionToken: string | null;
  /** slug eventu — używany do budowania URL recepcji po stronie klienta */
  eventSlug: string;
  /** Origin (np. https://eventro.pl) — fallback gdy brak NEXT_PUBLIC_ROOT_DOMAIN */
  origin: string;
}

function buildReceptionUrl(slug: string, origin: string, token: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) {
    return `https://${slug}.${rootDomain}/recepcja/${token}`;
  }
  return `${origin}/e/${slug}/recepcja/${token}`;
}

export function ReceptionTokenSection({
  eventId,
  receptionToken: initialToken,
  eventSlug,
  origin,
}: ReceptionTokenSectionProps) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const receptionUrl = token ? buildReceptionUrl(eventSlug, origin, token) : null;

  function handleGenerate() {
    startTransition(async () => {
      const newToken = await organizerGenerateReceptionToken(eventId);
      setToken(newToken);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await organizerRevokeReceptionToken(eventId);
      setToken(null);
    });
  }

  async function handleCopy() {
    if (!receptionUrl) return;
    try {
      await navigator.clipboard.writeText(receptionUrl);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Link dla obsługi</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Kto ma ten link, może meldować uczestników. Nie udostępniaj publicznie.
        </p>
      </div>

      {receptionUrl ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {receptionUrl}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="flex-1"
              disabled={pending}
            >
              {copied ? (
                <Check className="mr-1.5 size-4 text-green-600" />
              ) : (
                <Copy className="mr-1.5 size-4" />
              )}
              {copied ? "Skopiowano" : "Kopiuj link"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={pending}
              title="Generuj nowy link (unieważnia stary)"
            >
              <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevoke}
              disabled={pending}
              title="Usuń link recepcji"
              className="text-destructive hover:text-destructive"
            >
              <ShieldOff className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={pending}
          className="w-full"
        >
          <Link2 className="mr-2 size-4" />
          {pending ? "Generowanie…" : "Generuj link recepcji"}
        </Button>
      )}
    </div>
  );
}
