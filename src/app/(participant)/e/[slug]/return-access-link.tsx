import Link from "next/link";
import { buildEventInternalPath } from "@/lib/event-url";
import { cn } from "@/lib/utils";

/** „Masz już bilet? Wejdź ponownie” — dla uczestnika bez sesji na tym urządzeniu. */
export function ReturnAccessLink({
  slug,
  origin,
  className,
}: {
  slug: string;
  origin: string;
  className?: string;
}) {
  return (
    <Link
      href={buildEventInternalPath(slug, "/wejdz", origin)}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      Masz już bilet? <span className="font-medium underline underline-offset-4">Wejdź ponownie</span>
    </Link>
  );
}
