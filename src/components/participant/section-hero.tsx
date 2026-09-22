import { cn } from "@/lib/utils";

function ConnectionLineDeco() {
  return (
    <svg
      viewBox="0 0 160 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute right-0 top-0 h-full w-[42%]"
      aria-hidden
    >
      {/* Connecting lines */}
      <line
        x1="128" y1="22" x2="58" y2="65"
        stroke="url(#cl-g1)" strokeWidth="10" strokeLinecap="round"
      />
      <line
        x1="58" y1="65" x2="112" y2="108"
        stroke="url(#cl-g2)" strokeWidth="10" strokeLinecap="round"
      />
      {/* Balls */}
      <circle cx="128" cy="22"  r="22" fill="#5146E5" opacity="0.92" />
      <circle cx="58"  cy="65"  r="18" fill="#18B8A5" opacity="0.92" />
      <circle cx="112" cy="108" r="16" fill="#FF6B5E" opacity="0.88" />
      <defs>
        <linearGradient id="cl-g1" x1="128" y1="22" x2="58" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#5146E5" />
          <stop offset="100%" stopColor="#18B8A5" />
        </linearGradient>
        <linearGradient id="cl-g2" x1="58" y1="65" x2="112" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#18B8A5" />
          <stop offset="100%" stopColor="#FF6B5E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SectionHero({
  headline,
  headlineAccent,
  subtitle,
  illustration,
  className,
}: {
  headline: string;
  headlineAccent: string;
  subtitle?: string;
  illustration?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card px-5 py-6",
        className,
      )}
    >
      {illustration ? (
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          {illustration}
        </div>
      ) : (
        <ConnectionLineDeco />
      )}

      <div className="relative z-10 max-w-[62%]">
        <h1 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {headline}{" "}
          <span className="text-primary">{headlineAccent}</span>
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
