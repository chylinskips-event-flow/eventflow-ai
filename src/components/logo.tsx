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

  // adaptive: full logo image, light/dark versions toggled via Tailwind
  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/brand/eventro-logo-full.png"
        alt="Eventro"
        width={112}
        height={32}
        priority
        className="dark:hidden"
      />
      <Image
        src="/brand/eventro-logo-full-dark.png"
        alt="Eventro"
        width={112}
        height={32}
        priority
        className="hidden dark:block"
      />
    </div>
  );
}
