"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { checkEventSlugAvailability } from "@/app/(organizer)/admin/events/slug-actions";
import type { EventSlugCheck } from "@/lib/event-slug";
import { SLUG_MAX_LENGTH, sanitizeSlugInput, slugify, validateSlug } from "@/lib/slug";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Adres publiczny pokazywany w podglądzie (strona działa zawsze pod eventro.pl/e/<adres>). */
const PUBLIC_HOST = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "eventro.pl";
const CHECK_DELAY_MS = 500;

type Availability = { slug: string; result: EventSlugCheck | null } | null;

/**
 * Pole „Adres strony wydarzenia” (slug): stały początek `eventro.pl/e/` + edytowalna końcówka,
 * podgląd pełnego adresu, opis, dozwolone znaki i sprawdzanie dostępności na żywo z propozycją
 * wolnego adresu. Przy opublikowanym wydarzeniu zmiana adresu pokazuje ostrzeżenie (potwierdzenie
 * przy zapisie robi formularz Ustawień).
 */
export function EventAddressField({
  value,
  onChange,
  eventId = null,
  originalSlug = null,
  published = false,
  id = "slug",
  name = "slug",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Edycja istniejącego wydarzenia — przy sprawdzaniu pomijamy jego własny adres. */
  eventId?: string | null;
  originalSlug?: string | null;
  published?: boolean;
  id?: string;
  name?: string;
}) {
  const [availability, setAvailability] = useState<Availability>(null);
  const finalSlug = slugify(value);
  const unchanged = originalSlug !== null && finalSlug === originalSlug;
  const formatError = finalSlug ? validateSlug(finalSlug) : null;

  useEffect(() => {
    if (!finalSlug || unchanged || formatError) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await checkEventSlugAvailability(finalSlug, eventId);
      if (!cancelled) setAvailability({ slug: finalSlug, result });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [finalSlug, unchanged, formatError, eventId]);

  // Wynik dotyczy bieżącej wartości tylko, jeśli sprawdzono dokładnie ten adres.
  const current = availability?.slug === finalSlug ? availability.result : undefined;
  const checking = !!finalSlug && !unchanged && !formatError && current === undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>Adres strony wydarzenia</Label>
      <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
        <span className="flex shrink-0 items-center border-r bg-muted px-2 text-sm text-muted-foreground">
          {PUBLIC_HOST}/e/
        </span>
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(sanitizeSlugInput(e.target.value))}
          onBlur={() => onChange(slugify(value))}
          placeholder="nazwa-wydarzenia"
          maxLength={SLUG_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-describedby={`${id}-help ${id}-status`}
          className="min-w-0 rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        Tak uczestnicy znajdą stronę Twojego wydarzenia i taki adres będzie w linkach i kodach QR.
        Dozwolone: małe litery a–z, cyfry i myślniki (bez polskich znaków i spacji).
        {finalSlug && (
          <>
            {" "}
            Pełny adres: <span className="break-all font-mono text-foreground">{`${PUBLIC_HOST}/e/${finalSlug}`}</span>
          </>
        )}
      </p>
      <div id={`${id}-status`} aria-live="polite" className="text-xs">
        {formatError && (
          <p className="flex items-center gap-1.5 text-destructive">
            <XCircle className="size-3.5 shrink-0" /> {formatError}
          </p>
        )}
        {checking && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" /> Sprawdzanie dostępności…
          </p>
        )}
        {current?.status === "available" && (
          <p className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-3.5 shrink-0" /> Adres jest wolny.
          </p>
        )}
        {current?.status === "invalid" && (
          <p className="flex items-center gap-1.5 text-destructive">
            <XCircle className="size-3.5 shrink-0" /> {current.message}
          </p>
        )}
        {current?.status === "taken" && (
          <p className="flex flex-wrap items-center gap-1.5 text-destructive">
            <XCircle className="size-3.5 shrink-0" /> Ten adres jest zajęty
            {current.suggestion && (
              <>
                {" "}— spróbuj:{" "}
                <button
                  type="button"
                  onClick={() => onChange(current.suggestion as string)}
                  className="font-mono font-medium text-foreground underline underline-offset-2"
                >
                  {current.suggestion}
                </button>
              </>
            )}
          </p>
        )}
      </div>
      {published && originalSlug && !unchanged && finalSlug && (
        <p className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          Zmiana adresu unieważni dotychczasowe linki i kody QR (np. na wydrukach i w udostępnionych
          wiadomościach). Przed zapisem poprosimy o potwierdzenie.
        </p>
      )}
    </div>
  );
}
