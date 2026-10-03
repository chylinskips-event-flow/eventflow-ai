"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuditLogError, auditLog, requireSuperAdmin } from "@/lib/platform-admin";

// Każda akcja: requireSuperAdmin() → walidacja → zmiana (service_role) → audyt.
// Plan organizacji zmieniamy WYŁĄCZNIE przez entitlement_overrides — nigdy subscriptions
// (te są źródłem prawdy Stripe i nadpisuje je webhook).

export type PlatformActionState = { status: "idle" | "success" | "error"; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string, max = 500): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

async function withAudit(
  run: () => Promise<void>,
  success: string,
): Promise<PlatformActionState> {
  try {
    await run();
    return { status: "success", message: success };
  } catch (err) {
    console.error("[platform] action failed:", err instanceof Error ? err.message : err);
    if (err instanceof AuditLogError) {
      return {
        status: "error",
        message: "Zmiana zapisana, ale nie udało się zapisać wpisu audytu — sprawdź logi.",
      };
    }
    return { status: "error", message: "Nie udało się wykonać akcji. Spróbuj ponownie." };
  }
}

function revalidateOrg(organizationId: string) {
  revalidatePath("/admin/platform");
  revalidatePath(`/admin/platform/organizations/${organizationId}`);
}

/** Nadanie / zmiana override planu (grandfathering, comp, trial). */
export async function setPlanOverride(
  organizationId: string,
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const actor = await requireSuperAdmin();
  if (!UUID.test(organizationId)) return { status: "error", message: "Nieprawidłowa organizacja." };

  const planKey = text(formData, "plan_key", 50);
  const reason = text(formData, "reason");
  const expiresRaw = text(formData, "expires_at", 10);
  const commissionRaw = text(formData, "ticket_commission_pct", 10);

  if (!reason) return { status: "error", message: "Podaj powód (notatkę) override'u." };

  let expiresAt: string | null = null;
  if (expiresRaw) {
    const d = new Date(`${expiresRaw}T23:59:59Z`);
    if (Number.isNaN(d.getTime()) || d <= new Date()) {
      return { status: "error", message: "Data ważności musi być w przyszłości." };
    }
    expiresAt = d.toISOString();
  }

  let commission: number | null = null;
  if (commissionRaw) {
    commission = Number(commissionRaw.replace(",", "."));
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      return { status: "error", message: "Prowizja musi być liczbą 0–100." };
    }
  }

  const admin = createAdminClient();
  if (planKey) {
    const { data: plan } = await admin.from("plans").select("key").eq("key", planKey).maybeSingle();
    if (!plan) return { status: "error", message: "Nieznany plan." };
  }
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return { status: "error", message: "Organizacja nie istnieje." };
  if (!planKey && commission == null) {
    return { status: "error", message: "Wybierz plan albo ustaw prowizję." };
  }

  return withAudit(async () => {
    const { data: existing } = await admin
      .from("entitlement_overrides")
      .select("plan_key, limits, reason, expires_at")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const limits: Record<string, number | null> = { ...(existing?.limits ?? {}) };
    if (commission == null) delete limits.ticket_commission_pct;
    else limits.ticket_commission_pct = commission;

    const { error } = await admin.from("entitlement_overrides").upsert(
      {
        organization_id: organizationId,
        plan_key: planKey,
        limits,
        reason,
        expires_at: expiresAt,
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);

    await auditLog(actor, "set_plan_override", { type: "organization", id: organizationId }, {
      before: existing ?? null,
      after: { plan_key: planKey, limits, reason, expires_at: expiresAt },
    });
    revalidateOrg(organizationId);
  }, "Override zapisany.");
}

/** Zdjęcie override → organizacja wraca pod subskrypcję Stripe / Free. */
export async function removePlanOverride(organizationId: string): Promise<PlatformActionState> {
  const actor = await requireSuperAdmin();
  if (!UUID.test(organizationId)) return { status: "error", message: "Nieprawidłowa organizacja." };

  const admin = createAdminClient();
  return withAudit(async () => {
    const { data: existing } = await admin
      .from("entitlement_overrides")
      .select("plan_key, features, limits, reason, expires_at")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!existing) return;

    const { error } = await admin
      .from("entitlement_overrides")
      .delete()
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    await auditLog(actor, "remove_plan_override", { type: "organization", id: organizationId }, {
      before: existing,
    });
    revalidateOrg(organizationId);
  }, "Override zdjęty.");
}

export async function suspendOrganization(
  organizationId: string,
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const actor = await requireSuperAdmin();
  if (!UUID.test(organizationId)) return { status: "error", message: "Nieprawidłowa organizacja." };
  const reason = text(formData, "reason");
  if (!reason) return { status: "error", message: "Podaj powód zawieszenia." };

  const admin = createAdminClient();
  return withAudit(async () => {
    const { error } = await admin.from("organization_suspensions").upsert(
      { organization_id: organizationId, reason, suspended_by: actor.userId },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);
    await auditLog(actor, "suspend_organization", { type: "organization", id: organizationId }, { reason });
    revalidateOrg(organizationId);
    revalidatePath("/admin/platform/events");
  }, "Konto zawieszone.");
}

export async function unsuspendOrganization(organizationId: string): Promise<PlatformActionState> {
  const actor = await requireSuperAdmin();
  if (!UUID.test(organizationId)) return { status: "error", message: "Nieprawidłowa organizacja." };

  const admin = createAdminClient();
  return withAudit(async () => {
    const { error } = await admin
      .from("organization_suspensions")
      .delete()
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    await auditLog(actor, "unsuspend_organization", { type: "organization", id: organizationId });
    revalidateOrg(organizationId);
    revalidatePath("/admin/platform/events");
  }, "Zawieszenie zdjęte.");
}

export async function suspendEvent(
  eventId: string,
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const actor = await requireSuperAdmin();
  if (!UUID.test(eventId)) return { status: "error", message: "Nieprawidłowy event." };
  const reason = text(formData, "reason");
  if (!reason) return { status: "error", message: "Podaj powód zawieszenia." };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, organization_id, slug")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { status: "error", message: "Event nie istnieje." };

  return withAudit(async () => {
    const { error } = await admin.from("event_suspensions").upsert(
      { event_id: eventId, reason, suspended_by: actor.userId },
      { onConflict: "event_id" },
    );
    if (error) throw new Error(error.message);
    await auditLog(actor, "suspend_event", { type: "event", id: eventId }, {
      reason,
      slug: event.slug,
      organization_id: event.organization_id,
    });
    revalidatePath("/admin/platform/events");
    revalidateOrg(event.organization_id);
  }, "Event zawieszony.");
}

export async function unsuspendEvent(eventId: string): Promise<PlatformActionState> {
  const actor = await requireSuperAdmin();
  if (!UUID.test(eventId)) return { status: "error", message: "Nieprawidłowy event." };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();

  return withAudit(async () => {
    const { error } = await admin.from("event_suspensions").delete().eq("event_id", eventId);
    if (error) throw new Error(error.message);
    await auditLog(actor, "unsuspend_event", { type: "event", id: eventId });
    revalidatePath("/admin/platform/events");
    if (event) revalidateOrg(event.organization_id);
  }, "Zawieszenie eventu zdjęte.");
}
