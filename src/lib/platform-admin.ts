import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SuperAdmin = { userId: string; email: string | null };

/**
 * Twarda autoryzacja panelu operatora — wywoływać NA POCZĄTKU każdej strony i akcji
 * panelu, przed jakimkolwiek użyciem createAdminClient().
 * Rola sprawdzana funkcją is_platform_admin() na kliencie użytkownika (auth.uid()),
 * więc service_role nie jest używany do samej weryfikacji.
 * Brak sesji / brak roli → 404 (nie zdradzamy, że ścieżka istnieje).
 */
export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) {
    // Tylko log serwera (diagnostyka) — klient dostaje zwykłe 404.
    console.warn(
      "[platform-admin] access denied",
      JSON.stringify({
        userId: user.id,
        result: data ?? null,
        error: error ? { code: error.code, message: error.message } : null,
      }),
    );
    notFound();
  }

  return { userId: user.id, email: user.email ?? null };
}

/** Zmiana została zapisana, ale wpis audytu — nie. */
export class AuditLogError extends Error {}

export type AuditTarget = { type: "organization" | "event" | "platform"; id?: string | null };

/**
 * Wpis audytu — wyłącznie serwerowo, po requireSuperAdmin().
 * Rzuca przy błędzie zapisu, żeby brak audytu nie przeszedł po cichu.
 */
export async function auditLog(
  actor: SuperAdmin,
  action: string,
  target: AuditTarget,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await createAdminClient()
    .from("super_admin_audit_log")
    .insert({
      actor_user_id: actor.userId,
      actor_email: actor.email,
      action,
      target_type: target.type,
      target_id: target.id ?? null,
      details,
    });
  if (error) throw new AuditLogError(`audit log insert failed: ${error.message}`);
}
