import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserSuspended } from "@/lib/suspension";

// Panel organizatora nie trafia do wyszukiwarek (dodatkowo nagłówek X-Robots-Tag w next.config).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Druga warstwa blokady zawieszonego konta (pierwsza: middleware) — każda strona /admin.
// Operator platformy nie traci dostępu do swojego panelu, nawet gdy jego organizacja jest zawieszona.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (await isCurrentUserSuspended()) {
    const supabase = await createClient();
    const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
    if (isPlatformAdmin !== true) redirect("/suspended");
  }
  return children;
}
