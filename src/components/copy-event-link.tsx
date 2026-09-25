"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyEventLinkProps {
  slug: string;
  disabled?: boolean;
}

export function CopyEventLink({ slug, disabled }: CopyEventLinkProps) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    const url = `${window.location.origin}/e/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore — best-effort copy
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (disabled) {
    return (
      <span
        title="Opublikuj wydarzenie, aby udostępnić link"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <Button
          variant="ghost"
          size="icon"
          disabled
          aria-label="Kopiuj link rejestracji"
          className="size-8 pointer-events-none"
        >
          <Copy className="size-4" />
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={copy}
      aria-label="Kopiuj link rejestracji"
      className="size-8 shrink-0"
      title="Kopiuj link rejestracji"
    >
      {copied ? (
        <Check className="size-4 text-green-600" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}
