import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Miękki komunikat o funkcji spoza planu („dostępne w planie X").
 * Treść komunikatu liczona serwerowo przez featureGate()/upgradeMessage().
 */
export function UpgradeNotice({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 p-4 text-sm",
        className,
      )}
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{message}</p>
        <p className="text-muted-foreground">
          Skontaktuj się z nami, aby zmienić plan.
        </p>
      </div>
    </div>
  );
}

/** Pełnostronicowy wariant dla modułu w całości spoza planu. */
export function FeatureLockedPage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <UpgradeNotice message={message} />
    </main>
  );
}
