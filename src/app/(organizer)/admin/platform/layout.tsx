import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSuperAdmin } from "@/lib/platform-admin";
import { isBillingEnabled } from "@/lib/entitlements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Layout też weryfikuje rolę, ale każda strona i akcja robi to ponownie —
// layout nie renderuje się przy każdej nawigacji klienta.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  const billingEnabled = isBillingEnabled();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ChevronLeft className="size-4" />
              Panel organizatora
            </Link>
          </Button>
          <Link href="/admin/platform" className="font-semibold underline-offset-4 hover:underline">
            Panel operatora
          </Link>
          <Badge variant={billingEnabled ? "success" : "secondary"}>
            Billing {billingEnabled ? "włączony" : "wyłączony"}
          </Badge>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/platform">Organizacje</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/platform/events">Eventy</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/platform/audit">Audyt</Link>
          </Button>
          <span className="hidden self-center px-2 text-xs text-muted-foreground sm:inline">
            {admin.email}
          </span>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">{children}</main>
    </div>
  );
}
