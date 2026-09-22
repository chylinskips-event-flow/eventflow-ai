import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

function ConnectionLineDeco() {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute right-0 top-0 h-full w-[50%]"
      aria-hidden
    >
      <line
        x1="175" y1="22" x2="78" y2="82"
        stroke="url(#shdeco-g1)" strokeWidth="13" strokeLinecap="round"
      />
      <line
        x1="78" y1="82" x2="148" y2="138"
        stroke="url(#shdeco-g2)" strokeWidth="13" strokeLinecap="round"
      />
      <circle cx="175" cy="22"  r="30" fill="#5146E5" opacity="0.92" />
      <circle cx="78"  cy="82"  r="23" fill="#18B8A5" opacity="0.92" />
      <circle cx="148" cy="138" r="19" fill="#FF6B5E" opacity="0.88" />
      <defs>
        <linearGradient id="shdeco-g1" x1="175" y1="22" x2="78" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#5146E5" />
          <stop offset="100%" stopColor="#18B8A5" />
        </linearGradient>
        <linearGradient id="shdeco-g2" x1="78" y1="82" x2="148" y2="138" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#18B8A5" />
          <stop offset="100%" stopColor="#FF6B5E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Ikona sekcji w miękkim gradientowym kafelku. Przekaż jako `media` do SectionHero. */
export function SectionHeroMedia({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
      <Icon className="size-7 text-primary" />
    </div>
  );
}

export function SectionHero({
  headline,
  headlineAccent,
  subtitle,
  media,
  callout,
  imageSrc,
  imageAlt,
  backHref,
  className,
}: {
  headline: string;
  headlineAccent: string;
  subtitle?: string;
  /** Opcjonalna grafika (np. <SectionHeroMedia icon={Gift} />) — zastępuje Connection Line. */
  media?: React.ReactNode;
  /** Mały pill-dymek nad nagłówkiem (np. „Małe punkty. Wielkie możliwości."). */
  callout?: string;
  /** Zdjęcie-panel flush po prawej (1:1, WebP). Gdy ustawione, zastępuje ConnectionLineDeco i media. */
  imageSrc?: string;
  imageAlt?: string;
  /** Link „← Wróć" widoczny tylko na md+ (mobile ma dolny pasek nawigacji). */
  backHref?: string;
  className?: string;
}) {
  if (imageSrc) {
    return (
      <div
        className={cn(
          "flex min-h-[200px] items-stretch overflow-hidden rounded-2xl border bg-card",
          className,
        )}
      >
        {/* Lewa kolumna — tekst */}
        <div className="flex flex-1 flex-col justify-center p-6 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="mb-2 hidden md:inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-4" />
              Wróć
            </Link>
          )}
          {callout && (
            <span className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {callout}
            </span>
          )}
          <h1 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
            {headline}{" "}
            <span className="text-primary">{headlineAccent}</span>
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Prawy panel — zdjęcie flush */}
        <div className="relative w-[42%] shrink-0 self-stretch overflow-hidden sm:w-[44%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={imageAlt ?? ""}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              maskImage: "linear-gradient(to right, transparent 0%, #000 35%)",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 35%)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card px-6 py-7",
        className,
      )}
    >
      {media ? (
        <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2">
          {media}
        </div>
      ) : (
        <ConnectionLineDeco />
      )}
      <div className="relative z-10 max-w-[62%]">
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 hidden md:inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-4" />
            Wróć
          </Link>
        )}
        {callout && (
          <span className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {callout}
          </span>
        )}
        <h1 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {headline}{" "}
          <span className="text-primary">{headlineAccent}</span>
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
