import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoVariant = "onDark" | "adaptive" | "symbol";

export function Logo({
  variant = "adaptive",
  className,
}: {
  variant?: LogoVariant;
  className?: string;
}) {
  if (variant === "onDark") {
    return (
      <div className={cn("flex items-center", className)}>
        <Image
          src="/brand/eventro-logo-full-dark.png"
          alt="Eventro"
          width={112}
          height={32}
          priority
        />
      </div>
    );
  }

  if (variant === "symbol") {
    return (
      <div className={cn("flex items-center", className)}>
        <Image
          src="/brand/eventro-symbol.png"
          alt="Eventro"
          width={26}
          height={32}
          priority
        />
      </div>
    );
  }

  // adaptive: symbol + wordmark text that follows the color scheme
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/brand/eventro-symbol.png"
        alt=""
        aria-hidden
        width={26}
        height={32}
        priority
      />
      <span className="text-sm font-semibold text-foreground font-[family-name:var(--font-manrope)]">
        Eventro
      </span>
    </div>
  );
}
