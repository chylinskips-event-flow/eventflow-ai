import { cn } from "@/lib/utils";

export function Logo({
  variant = "full",
  className,
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const symbol = (
    <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white font-[family-name:var(--font-manrope)]">
      E
    </div>
  );

  if (variant === "compact") {
    return <div className={cn("flex items-center", className)}>{symbol}</div>;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {symbol}
      <span className="text-sm font-semibold font-[family-name:var(--font-manrope)]">
        Eventro
      </span>
    </div>
  );
}
