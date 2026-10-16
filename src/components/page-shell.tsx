import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Wspólna rama ekranu panelu organizatora: ta sama szerokość (max-w-3xl) i marginesy,
 * „Wróć” zawsze nad tytułem w tym samym miejscu, akcje po prawej od tytułu.
 */
export function PageShell({
  back,
  title,
  badge,
  description,
  actions,
  children,
}: {
  back?: { href: string; label: string };
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        {back && (
          <Link
            href={back.href}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {badge}
            </div>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {children}
    </main>
  );
}
